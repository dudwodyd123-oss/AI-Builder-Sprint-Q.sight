import { useNavigate } from "react-router-dom";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { isComplete } from "../profile.js";

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();

  // 기본정보가 없으면 먼저 입력받는다 (로그인 대체)
  const start = () => navigate(isComplete(profile) ? "/home" : "/profile?next=/home");

  return (
    <div className="fullscreen">
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 14 }}>
          Q<span style={{ color: "var(--accent)" }}>.</span>sight
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.78)", marginBottom: 36 }}>
          AI 상담사와 대화하며 나에게 꼭 맞는 기부를 찾고,
          <br />
          약정서 작성부터 전자서명까지 한 번에 끝내보세요.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 40,
          }}
        >
          {[
            ["🤖", "AI 상담"],
            ["📄", "자동 약정서"],
            ["✍️", "전자서명"],
          ].map(([icon, label]) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: "18px 8px",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={start}>
          시작하기
        </button>
      </div>
    </div>
  );
}
