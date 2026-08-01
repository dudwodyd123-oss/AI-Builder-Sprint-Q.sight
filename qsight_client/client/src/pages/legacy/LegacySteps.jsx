/** 유산기부 흐름의 현재 위치. 단계가 9개라 점을 다 그리지 않고 막대로 보여준다. */
const STEPS = [
  "안내 · 동의",
  "사업 선택",
  "대화",
  "대본 확인",
  "의향 등록",
  "증인 등록",
  "녹음",
  "확인",
  "완료",
];

export default function LegacySteps({ current }) {
  const index = Math.max(0, Math.min(STEPS.length - 1, current - 1));
  const percent = ((index + 1) / STEPS.length) * 100;

  return (
    <div className="legacy-steps">
      <div className="flex-between">
        <span className="legacy-steps-now">
          {index + 1}. {STEPS[index]}
        </span>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          {index + 1} / {STEPS.length}단계
          {index + 1 < STEPS.length && ` · 다음: ${STEPS[index + 1]}`}
        </span>
      </div>
      <div className="checklist-bar" style={{ margin: "10px 0 0" }}>
        <div className="checklist-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
