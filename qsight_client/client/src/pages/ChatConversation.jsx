import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { isFilled, buildAssistantMessage, withTopicParticle, toSummaryRows } from "../format.js";
import { profileValues } from "../profile.js";

export default function ChatConversation() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { program, form, setForm, values, setValues, messages, setMessages, profile } = usePledgeFlow();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [archived, setArchived] = useState(false); // 기관이 사업을 보관하면 더 진행할 수 없다
  const scrollRef = useRef(null);

  const fields = form?.fields || [];
  const programName = form?.program_name || program?.name || "";

  // 스키마를 확보하고, 대화가 처음이면 첫 인사말을 만든다
  // (확인 화면에 갔다 돌아온 경우에는 기존 대화를 그대로 이어간다)
  useEffect(() => {
    const start = (f) => {
      setForm(f);
      if (messages.length > 0) return;

      // 기본정보로 채울 수 있는 항목은 미리 채워두고, 챗봇은 나머지만 묻는다
      const fields = f.fields || [];
      const seeded = profileValues(fields, profile);
      const merged = { ...seeded, ...values };
      if (Object.keys(seeded).length > 0) setValues(merged);

      const missing = fields.filter((x) => x.required && !isFilled(merged[x.key]));
      const known = fields.filter((x) => isFilled(merged[x.key])).map((x) => x.label);
      const intro = `안녕하세요! ${f.program_name} 후원 약정을 도와드릴게요.`;
      const fromProfile =
        known.length > 0 ? ` 기본정보에서 ${withTopicParticle(known.join(", "))} 가져왔어요.` : "";

      setMessages([
        {
          role: "assistant",
          content: `${intro}${fromProfile} ${buildAssistantMessage({ fields, missing })}`,
        },
      ]);
    };

    if (form?.program_id === programId) {
      start(form);
      return;
    }
    api
      .getContractForm(programId)
      .then((res) => start(res.form))
      .catch((err) => {
        if (err.code === "PROGRAM_ARCHIVED") setArchived(true);
        setError(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const requiredFields = fields.filter((f) => f.required);
  const filledCount = requiredFields.filter((f) => isFilled(values[f.key])).length;
  const allFilled = requiredFields.length > 0 && filledCount === requiredFields.length;

  // 체크리스트도 질문과 같은 출처(스키마)를 쓴다. 필수가 먼저, 선택이 뒤에 온다.
  const checklist = toSummaryRows(fields, values);
  // 챗봇이 지금 묻고 있는 항목 = 아직 값이 없는 첫 번째 필수 항목
  const currentKey = checklist.find((row) => row.required && row.text === null)?.key;
  const progress = requiredFields.length > 0 ? (filledCount / requiredFields.length) * 100 : 0;
  const prefilledLabels = form?.prefilled_labels || [];

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await api.chat({ programId, messages: nextMessages, values });
      // 챗봇 문장은 LLM이 아니라 스키마와 수집 상태로부터 코드가 만든다
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: buildAssistantMessage({
            fields: res.fields || [],
            missing: res.missing || [],
            captured: res.captured || [],
            rejected: res.rejected || [],
            unclear: res.unclear || [],
            understoodNothing: res.understoodNothing,
          }),
        },
      ]);
      setValues(res.values || {});
      if (res.schemaVersion && res.schemaVersion !== form?.schema_version) {
        setNotice("계약서 서식이 변경되어 질문 항목이 갱신되었어요.");
      }
      setForm({
        ...(form || {}),
        fields: res.fields,
        prefilled_labels: res.prefilled ?? form?.prefilled_labels,
        schema_version: res.schemaVersion,
      });
    } catch (err) {
      if (err.code === "PROGRAM_ARCHIVED") setArchived(true);
      setError(err.message || "챗봇 응답 중 오류가 발생했어요.");
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

  return (
    <Layout title="AI 상담사 큐빗" subtitle={`${programName} 약정 상담 진행중`}>
      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}

      {archived && (
        <Card>
          <div className="center-col" style={{ padding: "24px 0" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🗄️</div>
            <p style={{ fontWeight: 700, margin: "0 0 6px" }}>모금이 종료된 사업이에요</p>
            <p className="text-muted" style={{ fontSize: 14, textAlign: "center", lineHeight: 1.7 }}>
              기관에서 이 사업을 보관해 더 이상 약정을 진행할 수 없어요.
              <br />
              진행 중인 다른 사업을 선택해주세요.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => navigate("/programs")}>
              다른 사업 보기
            </button>
          </div>
        </Card>
      )}

      {!archived && (
      <Card>
        <div className="checklist">
          <div className="flex-between">
            <span className="checklist-title">약정에 필요한 항목</span>
            <span className={`badge ${allFilled ? "badge-success" : "badge-pending"}`}>
              {filledCount} / {requiredFields.length}
            </span>
          </div>

          <div className="checklist-bar">
            <div className="checklist-bar-fill" style={{ width: `${progress}%` }} />
          </div>

          {checklist.length === 0 ? (
            <p className="checklist-empty">항목을 불러오는 중이에요...</p>
          ) : (
            <ul className="checklist-items">
              {checklist.map((row) => {
                const done = row.text !== null;
                const current = row.key === currentKey;
                return (
                  <li
                    key={row.key}
                    className={`checklist-item${done ? " done" : ""}${current ? " current" : ""}`}
                  >
                    <span className="checklist-mark" aria-hidden="true">
                      {done ? "✓" : ""}
                    </span>
                    <span className="checklist-label">
                      {row.label}
                      {!row.required && <span className="checklist-tag">선택</span>}
                    </span>
                    <span className="checklist-value" title={row.text || ""}>
                      {done ? row.text : current ? "질문 중" : "미입력"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {prefilledLabels.length > 0 && (
            <p className="checklist-note">
              기관이 미리 정해둔 항목: {prefilledLabels.map((p) => p.label || p.key).join(", ")} (질문하지
              않아요)
            </p>
          )}
        </div>

        <div className="chat-window" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="chat-bubble bot">큐빗이 답변을 작성하고 있어요...</div>}
        </div>

        {allFilled && (
          <div className="alert alert-info" style={{ marginTop: 4 }}>
            필요한 항목이 모두 모였어요. 다시 한번 확인할게요!
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={() => navigate(`/programs/${programId}/confirm`)}>
                입력 내용 확인하러 가기
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
            disabled={loading}
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
