import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";
import { rememberLegacyId } from "../../legacyLocal.js";

/** 유산기부 사용자는 고령일 가능성이 높다. 큰 글씨가 기본이고, 더 키울 수 있다. */
const SIZES = [22, 26, 32, 40];

/**
 * [4] 대본 확인 — 이 기능의 실질.
 *
 * 문장은 서버가 legacy-spec.json의 템플릿에 값을 끼워 만들어 준다. 화면은 그것을
 * 그대로 보여줄 뿐 문장을 만들지 않는다. 법정 요건 문장(editable=false)은 수정할 수 없다.
 */
export default function LegacyScript() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { spec, error: specError } = useLegacySpec();
  const { legacy, setLegacy } = usePledgeFlow();

  const [script, setScript] = useState(legacy.script);
  const [sizeIndex, setSizeIndex] = useState(1);
  const [editing, setEditing] = useState(null); // 편집 중인 블록 index
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const values = legacy.values || {};

  // 등록을 만들고(없으면) 지금 값으로 대본을 받아온다.
  //
  // 요청을 ref에 담아두는 이유: StrictMode는 개발 중에 effect를 두 번 실행하는데,
  // 그냥 두면 등록이 두 개 만들어진다(두 번째 실행 시점에는 아직 pledgeId가 없다).
  // 같은 요청을 재사용해 이 화면에서 등록이 한 번만 생기도록 한다.
  const requestRef = useRef(null);
  useEffect(() => {
    if (!spec) return;
    if (Object.keys(values).length === 0) {
      navigate(`/donate/legacy/${programId}/chat`, { replace: true });
      return;
    }

    if (!requestRef.current) {
      requestRef.current = legacy.pledgeId
        ? api.updateLegacyPledge(legacy.pledgeId, { values })
        : api.createLegacyPledge({
            programId,
            programName: legacy.program?.name,
            consent: legacy.consent,
            values,
          });
    }

    requestRef.current
      .then((res) => {
        rememberLegacyId(res.pledge.id);
        setScript(res.script);
        setLegacy({ pledgeId: res.pledge.id, script: res.script, overrides: {} });
      })
      .catch((err) => {
        requestRef.current = null; // 실패한 요청은 다시 시도할 수 있게 비운다
        setError(err.message || "대본을 만들지 못했어요.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const saveEdit = async (index) => {
    const text = draft.trim();
    if (!text) {
      setError("문장을 비워둘 수 없어요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const overrides = { ...(legacy.overrides || {}), [String(index)]: text };
      const res = await api.updateLegacyPledge(legacy.pledgeId, { scriptOverrides: overrides });
      setScript(res.script);
      setLegacy({ script: res.script, overrides });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const revert = async (index) => {
    setBusy(true);
    try {
      const overrides = { ...(legacy.overrides || {}) };
      delete overrides[String(index)];
      const res = await api.updateLegacyPledge(legacy.pledgeId, { scriptOverrides: overrides });
      setScript(res.script);
      setLegacy({ script: res.script, overrides });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const blocks = script?.blocks || [];
  const incomplete = blocks.some((b) => b.incomplete && b.missing?.some((m) => m !== "witness_name"));

  return (
    <Layout title="대본 확인" subtitle="녹음할 때 이 문장을 그대로 읽으시면 돼요">
      <LegacySteps current={4} />
      {(error || specError) && <div className="alert alert-danger">{error || specError}</div>}

      <div className="no-print">
        <Card>
          <div className="flex-between" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>글씨 크기</div>
              <p className="hint" style={{ margin: "4px 0 0" }}>
                녹음할 때도 이 크기로 보여드려요.
              </p>
            </div>
            <div className="gap-12">
              <button
                className="btn btn-ghost"
                onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
                disabled={sizeIndex === 0}
              >
                가 작게
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1))}
                disabled={sizeIndex === SIZES.length - 1}
              >
                가 크게
              </button>
              <button className="btn btn-secondary" onClick={() => window.print()}>
                인쇄 · PDF 저장
              </button>
            </div>
          </div>
        </Card>
      </div>

      {!script ? (
        <Card>
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        </Card>
      ) : (
        <>
          <div className="script-sheet" style={{ "--script-size": `${SIZES[sizeIndex]}px` }}>
            <div className="script-head no-print">
              <span className="text-muted" style={{ fontSize: 13 }}>
                {legacy.program?.name} · 문안 버전 {spec?.version}
              </span>
            </div>

            {blocks.map((block) => (
              <div key={block.index} className={`script-block ${block.speaker}`}>
                <div className="script-meta">
                  <span className={`badge ${block.speaker === "witness" ? "badge-muted" : "badge-pending"}`}>
                    {block.speaker === "witness" ? "증인이 읽어요" : "유언자가 읽어요"}
                  </span>
                  {block.requirement && (
                    <span className="badge badge-success">
                      법이 요구하는 문장 · {spec?.requirement_labels?.[block.requirement] || block.requirement}
                    </span>
                  )}
                  {!block.editable && <span className="script-lock no-print">수정 불가</span>}
                  {block.edited && <span className="script-edited no-print">수정함</span>}
                </div>

                {editing === block.index ? (
                  <div className="no-print">
                    <textarea
                      className="script-textarea"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                    />
                    <div className="gap-12" style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={() => saveEdit(block.index)} disabled={busy}>
                        이 문장으로 하기
                      </button>
                      <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
                        취소
                      </button>
                      {block.edited && (
                        <button className="btn btn-ghost" onClick={() => revert(block.index)} disabled={busy}>
                          처음 문장으로 되돌리기
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={`script-text${block.incomplete ? " incomplete" : ""}`}>{block.text}</p>
                    {block.editable && (
                      <button
                        className="btn btn-ghost no-print"
                        onClick={() => {
                          setEditing(block.index);
                          setDraft(block.text);
                        }}
                      >
                        이 문장 고치기
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            <p className="script-foot">
              증인 성명은 다음 단계에서 증인을 등록하면 채워집니다.
            </p>
          </div>

          <div className="no-print">
            {incomplete && (
              <div className="alert alert-danger">
                아직 빈칸이 있어요. 대화로 돌아가 남은 항목을 알려주세요.
              </div>
            )}
            <div className="legacy-actions">
              <button
                className="btn btn-ghost"
                onClick={() => navigate(`/donate/legacy/${programId}/chat`)}
              >
                대화로 돌아가기
              </button>
              <button
                className="btn btn-primary btn-lg"
                disabled={incomplete || busy}
                onClick={() => navigate(`/donate/legacy/${programId}/sign`)}
              >
                이 대본으로 진행하기
              </button>
            </div>
            <p className="hint" style={{ textAlign: "center" }}>
              다음 단계에서 기관에 기부 의사를 먼저 등록하고, 그다음 증인 등록·녹음으로 넘어가요.
            </p>
          </div>
        </>
      )}
    </Layout>
  );
}
