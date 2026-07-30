const STEPS = ["본인확인", "문서생성", "약정서", "서명"];

/** current: 0-based index of active step (0~3) */
export default function StepIndicator({ current }) {
  return (
    <div className="stepper">
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", flex: i === STEPS.length - 1 ? "0 0 auto" : 1 }}>
          <div className={`step${i === current ? " active" : ""}${i < current ? " done" : ""}`}>
            <div className="step-dot">{i < current ? "✓" : i + 1}</div>
            <div className="step-label">{label}</div>
          </div>
          {i < STEPS.length - 1 && <div className={`step-line${i < current ? " done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}
