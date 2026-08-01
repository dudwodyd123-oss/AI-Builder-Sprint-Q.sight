import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";
import { isFilled, buildAssistantMessage, toSummaryRows, withTopicParticle } from "../../format.js";
import { profileValues } from "../../profile.js";

/**
 * [3] 유산 전용 챗봇.
 *
 * 일반 약정 챗봇과 같은 규칙으로 움직인다 — 사용자에게 나가는 문장은 LLM이 아니라
 * 코드가 만들고(format.js), 무엇이 비었는지도 서버 코드가 판단한다.
 *
 * 다른 것은 질문지의 출처뿐이다. 여기서는 legacy-spec.json의 collect에 더해
 * **기관 계약서 서식의 항목까지 함께** 묻는다. 뒤의 기부 의사 등록이 기관 서식을
 * 요구하기 때문에, 그때 가서 따로 입력받지 않으려면 대화에서 다 모아야 한다.
 * 질문지를 합치는 일은 서버가 한다 (server/src/lib/legacySpec.js — chatFields).
 */
export default function LegacyChat() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { spec, loading: specLoading, error: specError } = useLegacySpec();
  const { legacy, setLegacy, profile } = usePledgeFlow();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const [fields, setFields] = useState([]);
  const scrollRef = useRef(null);

  const values = legacy.values || {};
  const messages = legacy.messages || [];
  const programName = legacy.program?.name || "";

  // 질문지를 서버에서 받아온다. 사용자 메시지 없이 부르면 LLM을 쓰지 않고
  // "지금 물어야 할 항목"만 돌려주므로, 이걸로 첫 인사말과 체크리스트를 만든다.
  // (대본 화면에 갔다 돌아온 경우에는 기존 대화를 그대로 이어간다)
  useEffect(() => {
    if (!spec) return;
    let alive = true;

    api
      .legacyChat({ programId, messages: [], values })
      .then((res) => {
        if (!alive) return;
        const list = res.fields || [];
        setFields(list);
        if (messages.length > 0) return;

        // 기본정보로 채울 수 있는 항목은 미리 채우고 나머지만 묻는다.
        // spec 항목은 profile 힌트로, 기관 서식 항목은 key·label을 보고 짝을 찾는다.
        const seeded = profileValues(list, profile);
        for (const field of list) {
          const hint = field.profile && profile?.[field.profile];
          if (hint?.trim()) seeded[field.key] = hint.trim();
        }
        const merged = { ...seeded, ...(res.values || {}) };

        const missing = list.filter((f) => f.required && !isFilled(merged[f.key]));
        const known = list.filter((f) => isFilled(merged[f.key])).map((f) => f.label);
        const fromProfile =
          known.length > 0 ? ` 기본정보에서 ${withTopicParticle(known.join(", "))} 가져왔어요.` : "";

        setLegacy({
          values: merged,
          messages: [
            {
              role: "assistant",
              content: `안녕하세요. ${programName || "이 사업"}에 남기실 내용을 여쭤볼게요.${fromProfile} ${buildAssistantMessage(
                { fields: list, missing }
              )}`,
            },
          ],
        });
      })
      .catch((err) => {
        if (!alive) return;
        if (err.code === "PROGRAM_ARCHIVED") setArchived(true);
        setError(err.message || "질문 항목을 불러오지 못했어요.");
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const requiredFields = fields.filter((f) => f.required);
  const filledCount = requiredFields.filter((f) => isFilled(values[f.key])).length;
  const allFilled = requiredFields.length > 0 && filledCount === requiredFields.length;
  const checklist = toSummaryRows(fields, values);
  const currentKey = checklist.find((r) => r.required && r.text === null)?.key;
  const progress = requiredFields.length > 0 ? (filledCount / requiredFields.length) * 100 : 0;
  // 어느 항목이 기관 약정서에서 온 것인지 표시해준다 (왜 묻는지 알 수 있게)
  const originOf = new Map(fields.map((f) => [f.key, f.origin]));

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setLegacy({ messages: nextMessages });
    setInput("");
    setError("");
    setLoading(true);
    try {
      const res = await api.legacyChat({ programId, messages: nextMessages, values });
      setFields(res.fields || []);
      setLegacy((l) => ({
        ...l,
        values: res.values || {},
        redirect: res.redirect || null,
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content: res.redirect
              ? res.redirect.notice
              : buildAssistantMessage({
                  fields: res.fields || [],
                  missing: res.missing || [],
                  captured: res.captured || [],
                  rejected: res.rejected || [],
                  unclear: res.unclear || [],
                  understoodNothing: res.understoodNothing,
                }),
          },
        ],
      }));
    } catch (err) {
      if (err.code === "PROGRAM_ARCHIVED") setArchived(true);
      setError(err.message || "대화 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (specError) {
    return (
      <Layout title="유산 기부">
        <div className="alert alert-danger">{specError}</div>
      </Layout>
    );
  }

  return (
    <Layout title="AI 상담사 큐빗" subtitle={`${programName} 유산기부 상담`}>
      <LegacySteps current={3} />
      {error && <div className="alert alert-danger">{error}</div>}

      {archived ? (
        <Card>
          <div className="center-col" style={{ padding: "24px 0" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🗄️</div>
            <p style={{ fontWeight: 700, margin: "0 0 6px" }}>모금이 종료된 사업이에요</p>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => navigate("/donate/legacy/programs")}>
              다른 사업 보기
            </button>
          </div>
        </Card>
      ) : specLoading ? (
        <Card>
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="checklist">
            <div className="flex-between">
              <span className="checklist-title">유언과 약정서에 필요한 항목</span>
              <span className={`badge ${allFilled ? "badge-success" : "badge-pending"}`}>
                {filledCount} / {requiredFields.length}
              </span>
            </div>
            <div className="checklist-bar">
              <div className="checklist-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <ul className="checklist-items">
              {checklist.map((row) => {
                const done = row.text !== null;
                const current = row.key === currentKey;
                return (
                  <li
                    key={row.key}
                    className={`checklist-item${done ? " done" : ""}${current ? " current" : ""}`}
                  >
                    <span className="checklist-mark" aria-hidden="true">{done ? "✓" : ""}</span>
                    <span className="checklist-label">
                      {row.label}
                      {originOf.get(row.key) === "corp" && (
                        <span className="checklist-tag" title="기관 약정서에 들어가는 항목이에요">
                          약정서
                        </span>
                      )}
                      {!row.required && <span className="checklist-tag">선택</span>}
                    </span>
                    <span className="checklist-value" title={row.text || ""}>
                      {done ? row.text : current ? "질문 중" : "미입력"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="chat-window" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-bubble bot">큐빗이 답변을 작성하고 있어요...</div>}
          </div>

          {/* 보험금은 유언이 아니라 수익자 변경이 확실하다 — 여기서 흐름을 끊고 안내한다 */}
          {legacy.redirect && (
            <div className="alert alert-info" style={{ marginTop: 4 }}>
              <strong>{legacy.redirect.label}은 다른 방법이 더 확실해요</strong>
              <p style={{ margin: "8px 0 0", lineHeight: 1.7 }}>{legacy.redirect.notice}</p>
              <div className="gap-12" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const next = { ...values };
                    delete next.bequest_type;
                    const typeField = fields.find((f) => f.key === "bequest_type");
                    setLegacy((l) => ({
                      ...l,
                      redirect: null,
                      values: next,
                      messages: [
                        ...l.messages,
                        {
                          role: "assistant",
                          content: buildAssistantMessage({
                            fields,
                            missing: typeField ? [typeField] : [],
                          }),
                        },
                      ],
                    }));
                  }}
                >
                  다른 방식으로 다시 고르기
                </button>
                <button className="btn btn-secondary" onClick={() => navigate("/home")}>
                  홈으로
                </button>
              </div>
            </div>
          )}

          {allFilled && !legacy.redirect && (
            <div className="alert alert-info" style={{ marginTop: 4 }}>
              필요한 내용이 모두 모였어요. 읽으실 대본을 만들어 드릴게요.
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/donate/legacy/${programId}/script`)}
                >
                  대본 확인하러 가기
                </button>
              </div>
            </div>
          )}

          <div className="chat-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요"
              disabled={loading || Boolean(legacy.redirect)}
            />
            <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>
              전송
            </button>
          </div>
        </Card>
      )}
    </Layout>
  );
}
