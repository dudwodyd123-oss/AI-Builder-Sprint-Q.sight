import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { TYPE_LABEL } from "../context/PledgeContext.jsx";

export default function ChatStart() {
  const [params] = useSearchParams();
  const type = params.get("type") || "regular";
  const navigate = useNavigate();

  return (
    <Layout title="AI 상담 시작" subtitle={`${TYPE_LABEL[type] || "기부"} 상담을 도와드릴게요`}>
      <Card>
        <div className="center-col" style={{ padding: "20px 0" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              marginBottom: 18,
            }}
          >
            🤖
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>안녕하세요, AI 상담사 큐빗이에요</h2>
          <p className="text-muted" style={{ maxWidth: 420, lineHeight: 1.7, fontSize: 14.5 }}>
            {TYPE_LABEL[type]}에 필요한 정보를 대화로 편하게 여쭤볼게요. 후원 대상, 금액, 주기 등을 알려주시면
            제가 약속 내용을 정리해서 약정서까지 만들어 드릴게요.
          </p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 22 }} onClick={() => navigate(`/chat/${type}`)}>
            대화 시작하기
          </button>
        </div>
      </Card>
    </Layout>
  );
}
