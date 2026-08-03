import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { loadChatHistoryIds } from "../chatHistoryLocal.js";

/**
 * AI 대화 기록 보기.
 *
 * 정기/일시 기부, 유산기부, 문화유산 후원, 고향사랑기부 — 필요한 항목이 모두 채워진
 * 시점에 저장된 대화를 여기서 다시 볼 수 있다. 로그인이 없으므로 이 브라우저가
 * 기억하는 id 목록으로만 조회한다 (chatHistoryLocal.js, server/src/routes/chatHistory.js 참고).
 */
export default function ChatHistory() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const ids = loadChatHistoryIds();
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    api
      .lookupChatHistory(ids)
      .then((res) => setConversations(res.conversations || []))
      .catch((err) => setError(err.message || "대화 기록을 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <Layout title="AI 대화 기록" subtitle="AI 상담사와 나눈 대화를 다시 볼 수 있어요">
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title="상담 대화 목록" subtitle="이 브라우저에서 나눈 대화만 보여요">
        {loading ? (
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>
            아직 저장된 대화가 없어요. AI 상담사와 대화를 마치면 여기에 기록이 남아요.
          </p>
        ) : (
          <div className="doc-list">
            {conversations.map((c) => (
              <div key={c.id}>
                <div className="doc-row">
                  <div>
                    <div className="title">{c.context}</div>
                    <div className="meta">
                      {new Date(c.createdAt).toLocaleString("ko-KR")}
                      {c.programName && ` · ${c.programName}`}
                      {` · ${c.turns}번 대화`}
                    </div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => toggle(c.id)}>
                    {openId === c.id ? "닫기" : "대화 보기"}
                  </button>
                </div>
                {openId === c.id && (
                  <div className="chat-window" style={{ marginBottom: 16 }}>
                    {(c.messages || []).map((m, i) => (
                      <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
                        {m.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
}
