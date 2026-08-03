import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const OPTIONS = {
  // 약속 시작하기: 두 경로 모두 기업용 서버가 관리하는 모금 사업 목록으로 연결된다
  pledge: [
    {
      key: "regular",
      icon: "sync",
      title: "정기/일시 기부",
      desc: "매월 또는 매년 원하는 금액을 꾸준히 후원해요. AI 상담사와 대화하며 약정을 진행합니다.",
      to: "/programs",
    },
    {
      key: "legacy",
      icon: "history_edu",
      title: "유산 기부",
      desc: "사후 자산의 일부를 남기는 약속이에요. 대본을 만들어 증인과 함께 녹음까지 도와드려요.",
      to: "/donate/legacy",
    },
  ],
  find: [
    {
      key: "hometown",
      icon: "cottage",
      title: "고향사랑기부",
      desc: "내가 원하는 지자체에 기부하고 답례품과 세액공제 혜택을 받아보세요.",
      to: "/donate/hometown",
    },
    {
      key: "heritage",
      icon: "temple_buddhist",
      title: "문화유산 후원",
      desc: "소중한 문화유산의 보존과 관리를 위한 후원에 참여해보세요.",
      to: "/donate/heritage",
    },
  ],
};

export default function DonationTypeSelect() {
  const [params] = useSearchParams();
  const entry = params.get("entry") === "find" ? "find" : "pledge";
  const navigate = useNavigate();
  const { setEntry } = usePledgeFlow();

  const handleSelect = (opt) => {
    setEntry(entry);
    navigate(opt.to);
  };

  return (
    <Layout
      title="기부 유형 선택"
      subtitle={entry === "pledge" ? "어떤 방식으로 약속을 시작할까요?" : "어떤 기부처를 찾고 계신가요?"}
    >
      <div className="choice-grid">
        {OPTIONS[entry].map((opt) => (
          <button key={opt.key} className="choice-card" onClick={() => handleSelect(opt)}>
            <div className="icon"><Icon name={opt.icon} size={22} /></div>
            <h3>{opt.title}</h3>
            <p>{opt.desc}</p>
          </button>
        ))}
      </div>
    </Layout>
  );
}
