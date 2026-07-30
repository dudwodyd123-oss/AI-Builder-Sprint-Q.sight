import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow, TYPE_LABEL } from "../context/PledgeContext.jsx";

const GREETING = {
  regular: "안녕하세요! 정기 기부 약속을 도와드릴게요. 어떤 단체나 캠페인을 후원하고 싶으신가요?",
  legacy: "안녕하세요! 유산 기부 상담을 시작할게요. 어떤 대상에게 유산을 기부하고 싶으신가요?",
  hometown: "안녕하세요! 고향사랑기부 상담을 도와드릴게요. 어느 지자체에 기부하고 싶으신가요?",
  heritage: "안녕하세요! 문화유산 후원 상담을 시작할게요. 어떤 문화유산을 후원하고 싶으신가요?",
};

export default function ChatConversation() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { setPledge } = usePledgeFlow();
  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING[type] || GREETING.regular }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const res = await api.chat(type, nextMessages);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.ready && res.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      setError(err.message || "챗봇 응답 중 오류가 발생했어요. server/.env의 UPSTAGE_API_KEY를 확인해주세요.");
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

  const confirmSummary = async () => {
    setCreating(true);
    setError("");
    try {
      const { pledge } = await api.createPledge(summary);
      setPledge(pledge);
      navigate(`/pledge/${pledge.id}/confirm`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout title="AI 상담사 큐빗" subtitle={`${TYPE_LABEL[type] || "기부"} 상담 진행중`}>
      <Card>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="chat-window" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="chat-bubble bot">큐빗이 답변을 작성하고 있어요...</div>}
        </div>

        {summary ? (
          <div className="alert alert-info" style={{ marginTop: 4 }}>
            대화 내용을 바탕으로 약속 정보를 정리했어요. 다음 단계에서 자세히 확인할 수 있어요.
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={confirmSummary} disabled={creating}>
                {creating ? "생성중..." : "약속 내용 확정하러 가기"}
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </Card>
    </Layout>
  );
}
