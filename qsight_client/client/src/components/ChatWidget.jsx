import { useEffect, useRef, useState } from "react";
import Card from "./Card.jsx";
import Icon from "./Icon.jsx";
import { buildAssistantMessage, isFilled } from "../format.js";

/**
 * 고향사랑기부 / 문화유산후원 페이지에 바로 얹는 대화형 신청서 작성 위젯.
 *
 * 정기후원·유산기부의 ChatConversation.jsx(별도 페이지 + PledgeContext)와 달리,
 * 이 두 화면은 한 페이지짜리 단순 신청서라 위젯을 폼 위에 접었다 펼쳤다 하는 형태로
 * 바로 얹는다. 대화로 모은 값은 onValues로 부모의 폼 state에 그대로 합쳐진다 — 이 위젯의
 * fields[].key가 부모 폼 state의 key와 같아야 자연스럽게 합쳐진다 (예: amount, donorName).
 *
 * LLM은 여기서도 "메시지에서 값 추출"에만 쓰인다 — 질문 문장은 fields 스키마로부터
 * format.js가 그대로 만든다(정기후원 챗봇과 같은 원칙, chatFn만 화면별로 다르다).
 */
export default function ChatWidget({ title = "AI 상담사와 대화로 채우기", fields, chatFn, values, onValues, onMessagesChange }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const requiredFields = fields.filter((f) => f.required);
  const filledCount = requiredFields.filter((f) => isFilled(values[f.key])).length;
  const allFilled = requiredFields.length > 0 && filledCount === requiredFields.length;

  // 처음 펼칠 때 첫 인사말을 만든다 (이미 채워진 항목이 있으면 그 사실도 알려준다)
  useEffect(() => {
    if (!open || messages.length > 0) return;
    const missing = fields.filter((f) => f.required && !isFilled(values[f.key]));
    const known = fields.filter((f) => isFilled(values[f.key])).map((f) => f.label);
    const intro = "안녕하세요! 신청서 작성을 도와드릴게요.";
    const fromForm = known.length > 0 ? ` ${known.join(", ")}은(는) 이미 입력돼 있네요.` : "";
    setMessages([
      {
        role: "assistant",
        content: `${intro}${fromForm} ${buildAssistantMessage({ fields, missing })}`,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // 대화 내역이 바뀔 때마다 부모에 그대로 알린다 — 신청 접수 시점에 로그로 저장하기 위함
  // (화면에는 필요 없고, 저장 성공 여부만 콘솔에 남기면 충분하다)
  useEffect(() => {
    onMessagesChange?.(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await chatFn({ messages: nextMessages, values });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: buildAssistantMessage({
            fields: res.fields || fields,
            missing: res.missing || [],
            captured: res.captured || [],
            rejected: res.rejected || [],
            unclear: res.unclear || [],
            understoodNothing: res.understoodNothing,
          }),
        },
      ]);
      onValues(res.values || {});
    } catch (err) {
      setError(err.message || "챗봇 응답 중 오류가 발생했어요.");
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

  return (
    <Card>
      <div className="flex-between" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span className="checklist-title">
          <Icon name="chat" size={18} style={{ verticalAlign: "-4px", marginRight: 6 }} />
          {title}
        </span>
        <span className="gap-12" style={{ alignItems: "center", display: "flex" }}>
          <span className={`badge ${allFilled ? "badge-success" : "badge-pending"}`}>
            {filledCount} / {requiredFields.length}
          </span>
          <Icon name={open ? "expand_less" : "expand_more"} size={20} />
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="chat-window" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-bubble bot">답변을 작성하고 있어요...</div>}
          </div>

          <div className="chat-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요 (예: 3만원씩 매달 낼게요)"
              disabled={loading}
            />
            <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>
              전송
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            대화로 답하면 아래 신청 폼에 바로 채워져요. 폼에 직접 입력해도 돼요.
          </p>
        </div>
      )}
    </Card>
  );
}
