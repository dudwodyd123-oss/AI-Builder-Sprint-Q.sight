import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const OPTIONS = {
  pledge: [
    {
      type: "regular",
      icon: "🔁",
      title: "정기 기부",
      desc: "매월 또는 매년 원하는 금액을 자동으로 후원해요. AI 상담사와 대화하며 약정을 진행합니다.",
      action: (navigate) => navigate("/chat/start?type=regular"),
    },
    {
      type: "legacy",
      icon: "🕊️",
      title: "유산 기부",
      desc: "사후 자산의 일부를 기부하는 약정이에요. 신청서를 통해 상세 내용을 입력합니다.",
      action: (navigate) => navigate("/donate/legacy"),
    },
  ],
  find: [
    {
      type: "hometown",
      icon: "🏘️",
      title: "고향사랑기부",
      desc: "내가 원하는 지자체에 기부하고 답례품과 세액공제 혜택을 받아보세요.",
      action: (navigate) => navigate("/donate/hometown"),
    },
    {
      type: "heritage",
      icon: "🏛️",
      title: "문화유산 후원",
      desc: "소중한 문화유산의 보존과 관리를 위한 후원에 참여해보세요.",
      action: (navigate) => navigate("/donate/heritage"),
    },
  ],
};

export default function DonationTypeSelect() {
  const [params] = useSearchParams();
  const entry = params.get("entry") === "find" ? "find" : "pledge";
  const navigate = useNavigate();
  const { setEntry, setType } = usePledgeFlow();

  const options = OPTIONS[entry];

  const handleSelect = (opt) => {
    setEntry(entry);
    setType(opt.type);
    opt.action(navigate);
  };

  return (
    <Layout
      title="기부 유형 선택"
      subtitle={entry === "pledge" ? "어떤 방식으로 약속을 시작할까요?" : "어떤 기부처를 찾고 계신가요?"}
    >
      <div className="choice-grid">
        {options.map((opt) => (
          <button key={opt.type} className="choice-card" onClick={() => handleSelect(opt)}>
            <div className="icon">{opt.icon}</div>
            <h3>{opt.title}</h3>
            <p>{opt.desc}</p>
          </button>
        ))}
      </div>
    </Layout>
  );
}
