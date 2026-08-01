import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 고지문을 소리 내어 읽어주는 버튼.
 *
 * 유산기부는 이용자 상당수가 고령이라, 법적 고지와 필수 동의처럼 "반드시 이해하고
 * 넘어가야 하는" 문장에만 붙인다. 대본은 본인이 직접 읽어 녹음해야 하므로 붙이지 않는다.
 *
 * ⚠️ 녹음 중에는 절대 쓰면 안 된다. 합성음이 마이크에 섞여 들어가면 녹음유언의
 *    증거력이 훼손된다. 그런 화면에서는 disabled를 넘겨 막는다.
 *
 * 브라우저 내장 Web Speech API만 쓴다. 외부 전송이 없으므로 고지 내용이 밖으로 나가지 않는다.
 */

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Chrome은 getVoices()가 처음에 빈 배열을 준다. voiceschanged를 기다리되 무한정은 아니다. */
function waitForVoices(synth) {
  return new Promise((resolve) => {
    const existing = synth.getVoices();
    if (existing.length > 0) return resolve(existing);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(synth.getVoices());
    };
    synth.addEventListener?.("voiceschanged", finish, { once: true });
    setTimeout(finish, 1500); // voiceschanged가 아예 안 뜨는 브라우저 대비
  });
}

export default function SpeakButton({ text, label = "읽어주기", disabled = false, className = "" }) {
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const watchdogRef = useRef(null);
  const aliveRef = useRef(true);

  const content = (Array.isArray(text) ? text : [text])
    .filter(Boolean)
    .map((t) => String(t).trim())
    .join(". ");

  const reset = useCallback(() => {
    clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
    if (aliveRef.current) setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    reset();
  }, [reset]);

  // 화면을 떠나거나 탭이 가려지면 낭독을 멈춘다
  useEffect(() => {
    aliveRef.current = true;
    const onHidden = () => document.hidden && stop();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onHidden);
      if (supported) window.speechSynthesis.cancel();
      clearTimeout(watchdogRef.current);
    };
  }, [stop]);

  // 녹음이 시작되는 등 도중에 막히면 즉시 멈춘다
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const start = useCallback(async () => {
    if (!supported || !content) return;
    const synth = window.speechSynthesis;
    synth.cancel(); // 다른 버튼이 읽고 있었다면 넘겨받는다

    setNotice("");
    setSpeaking(true);

    const voices = await waitForVoices(synth);
    if (!aliveRef.current) return;

    const utter = new SpeechSynthesisUtterance(content);
    utter.lang = "ko-KR";
    utter.rate = 0.9; // 고령 이용자를 고려해 기본보다 조금 느리게
    utter.pitch = 1;

    const korean = voices.find((v) => v.lang?.toLowerCase().startsWith("ko"));
    if (korean) utter.voice = korean;

    let started = false;
    utter.onstart = () => {
      started = true;
      clearTimeout(watchdogRef.current);
    };
    utter.onend = reset;
    utter.onerror = () => {
      reset();
      if (!started && aliveRef.current) {
        setNotice("음성 재생에 실패했어요. 화면의 글을 읽어주세요.");
      }
    };

    synth.speak(utter);

    // 소리 없이 실패하는 환경(설치된 TTS 음성 없음)을 사용자에게 알린다
    watchdogRef.current = setTimeout(() => {
      if (!started && !synth.speaking && aliveRef.current) {
        reset();
        setNotice(
          voices.length > 0
            ? "음성이 시작되지 않았어요. 새로고침 후 다시 시도해주세요."
            : "이 기기에 한국어 음성이 없어 읽어드릴 수 없어요."
        );
      }
    }, 2000);
  }, [content, reset]);

  if (!supported || !content) return null;

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost speak-btn${speaking ? " speaking" : ""} ${className}`.trim()}
        onClick={speaking ? stop : start}
        disabled={disabled}
        aria-pressed={speaking}
        title={disabled ? "녹음 중에는 사용할 수 없어요" : speaking ? "읽기 중지" : "소리로 들려드려요"}
      >
        <span aria-hidden="true">{speaking ? "■" : "🔊"}</span>
        <span>{speaking ? "읽기 중지" : label}</span>
      </button>
      {notice && <p className="hint speak-notice">{notice}</p>}
    </>
  );
}
