import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";

/** 최대 10분. 넘으면 자동으로 종료한다. */
const MAX_MS = 10 * 60 * 1000;

const SIZES = [22, 26, 32, 40];

/** 브라우저가 실제로 지원하는 포맷을 고른다 (사파리는 webm을 못 만든다) */
function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function mmss(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * [7] 녹음.
 *
 * 반드시 지킬 것 (LEGACY_PLAN.md §7)
 *  - 파일 업로드 input을 만들지 않는다 — 재생본·편집본이 들어오면 무효 사유
 *  - 일시정지 버튼을 두지 않는다 — 증인 진술이 따로 녹음되면 무효로 본 판례가 있다
 *  - 중단하면 그 녹음은 폐기하고 처음부터
 */
export default function LegacyRecord() {
  const { pledgeId } = useParams();
  const navigate = useNavigate();
  const { spec } = useLegacySpec();
  const { legacy, setLegacy } = usePledgeFlow();

  const [script, setScript] = useState(legacy.script);
  const [phase, setPhase] = useState("idle"); // idle | recording | uploading
  const [elapsed, setElapsed] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(1);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const abortedRef = useRef(false);

  const blocks = script?.blocks || [];

  useEffect(() => {
    if (legacy.pledgeId === pledgeId && legacy.script) return;
    api
      .getLegacyPledge(pledgeId)
      .then((res) => {
        setScript(res.script);
        setLegacy({ pledgeId: res.pledge.id, script: res.script, witness: res.pledge.witness });
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pledgeId]);

  /** 녹음 중에는 실수로 창을 닫지 못하게 막는다 */
  useEffect(() => {
    if (phase !== "recording") return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const cleanup = useCallback(() => {
    clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const upload = useCallback(
    async (blob, durationMs) => {
      setPhase("uploading");
      try {
        const res = await api.uploadLegacyRecording(pledgeId, blob, durationMs);
        setLegacy({ recording: res.pledge.recording, script: res.script });
        navigate(`/legacy/${pledgeId}/review`);
      } catch (err) {
        setError(`${err.message} 녹음을 저장하지 못했어요. 처음부터 다시 진행해주세요.`);
        setPhase("idle");
        setElapsed(0);
        setCursor(0);
      }
    },
    [navigate, pledgeId, setLegacy]
  );

  const start = async () => {
    setError("");
    const mimeType = pickMimeType();
    if (mimeType === null) {
      setError("이 브라우저는 녹음을 지원하지 않아요. 크롬이나 엣지에서 열어주세요.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("마이크를 사용할 수 없어요. 브라우저의 마이크 권한을 허용해주세요.");
      return;
    }

    chunksRef.current = [];
    abortedRef.current = false;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const duration = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      cleanup();
      // 중단한 녹음은 올리지 않고 버린다
      if (abortedRef.current) {
        setPhase("idle");
        setElapsed(0);
        setCursor(0);
        return;
      }
      upload(blob, duration);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    setPhase("recording");
    setCursor(0);
    setElapsed(0);

    tickRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_MS) recorderRef.current?.stop(); // 10분에서 자동 종료
    }, 250);
  };

  const finish = () => {
    if (phase !== "recording") return;
    recorderRef.current?.stop();
  };

  const abort = () => {
    if (phase !== "recording") return;
    if (!window.confirm("지금 중단하면 이 녹음은 저장되지 않고 처음부터 다시 하셔야 해요. 중단할까요?")) {
      return;
    }
    abortedRef.current = true;
    recorderRef.current?.stop();
  };

  const atLast = cursor >= blocks.length - 1;

  return (
    <Layout title="녹음" subtitle="대본을 소리 내어 읽어주세요">
      <LegacySteps current={7} />
      {error && <div className="alert alert-danger">{error}</div>}

      <Card>
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          {spec?.notices?.record}
        </div>
        <ul className="legacy-flow" style={{ marginTop: 16 }}>
          <li>증인이 옆에 계신지 확인해주세요. 증인도 마지막 두 문장을 읽습니다.</li>
          <li>시작하면 끝날 때까지 멈추지 않습니다. 일시정지는 없어요.</li>
          <li>문장은 [다음] 버튼으로 넘기시면 되고, 그동안 녹음은 계속됩니다.</li>
        </ul>
      </Card>

      {phase === "idle" ? (
        <Card>
          <div className="center-col" style={{ padding: "10px 0 4px" }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🎙️</div>
            <p className="text-muted" style={{ fontSize: 14, textAlign: "center", lineHeight: 1.8 }}>
              준비되셨으면 아래 버튼을 눌러주세요.
              <br />
              마이크 사용 허용을 물어보면 "허용"을 눌러주세요.
            </p>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18 }} onClick={start}>
              녹음 시작
            </button>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/legacy/${pledgeId}/witness`)}
            >
              증인 정보 다시 보기
            </button>
          </div>
        </Card>
      ) : phase === "uploading" ? (
        <Card>
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
            <p className="text-muted" style={{ marginTop: 16, fontSize: 14 }}>녹음을 저장하고 있어요...</p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex-between">
              <span className="recording-dot">녹음 중 {mmss(elapsed)}</span>
              <div className="gap-12">
                <span className="text-muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
                  최대 {mmss(MAX_MS)}
                </span>
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
              </div>
            </div>
            <div className="checklist-bar" style={{ margin: "12px 0 0" }}>
              <div className="checklist-bar-fill" style={{ width: `${(elapsed / MAX_MS) * 100}%` }} />
            </div>
          </Card>

          <div className="script-sheet reading" style={{ "--script-size": `${SIZES[sizeIndex]}px` }}>
            {blocks.map((block, i) => (
              <div
                key={block.index}
                className={`script-block ${block.speaker}${i === cursor ? " now" : ""}${i < cursor ? " read" : ""}`}
              >
                <div className="script-meta">
                  <span className={`badge ${block.speaker === "witness" ? "badge-muted" : "badge-pending"}`}>
                    {block.speaker === "witness" ? "증인이 읽어요" : "유언자가 읽어요"}
                  </span>
                  {block.requirement && (
                    <span className="badge badge-success">
                      {spec?.requirement_labels?.[block.requirement] || block.requirement}
                    </span>
                  )}
                </div>
                <p className="script-text">{block.text}</p>
              </div>
            ))}
          </div>

          <div className="legacy-actions">
            <button className="btn btn-ghost" onClick={abort}>
              중단하기
            </button>
            {atLast ? (
              <button className="btn btn-primary btn-lg" onClick={finish}>
                다 읽었어요 · 녹음 종료
              </button>
            ) : (
              <button className="btn btn-secondary btn-lg" onClick={() => setCursor((c) => c + 1)}>
                다음 문장 ({cursor + 1}/{blocks.length})
              </button>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
