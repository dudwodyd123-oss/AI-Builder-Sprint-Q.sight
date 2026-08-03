import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import { api } from "../api.js";
import { rememberHeritageId } from "../heritageLocal.js";
import { rememberChatHistoryId } from "../chatHistoryLocal.js";

/* 국가유산청 API가 사진을 제공하지 않는 경우(현재 연동된 레거시 API가 그렇다)를 대비한
   대체 아이콘. 출처가 불분명한 사진을 가져다 쓰지 않고, 종류별로 우리가 그린 아이콘 +
   그라디언트 배경으로 대신 보여준다. 실제 사진 URL이 오는 데이터셋으로 바뀌면
   (예: data.go.kr 3070426 문화재 공간 정보) item.image가 자동으로 채워져 사진이 뜬다. */
const CATEGORY_ICON = {
  궁궐: "castle",
  사찰: "temple_buddhist",
  종묘: "account_balance",
  민속마을: "cottage",
  성곽: "fort",
};

function categoryIcon(item) {
  for (const key of Object.keys(CATEGORY_ICON)) {
    if (item.category?.includes(key) || item.name?.includes(key)) return CATEGORY_ICON[key];
  }
  return "account_balance";
}

const FALLBACK_HERITAGES = [
  { id: "static-1", name: "경복궁 보존회" },
  { id: "static-2", name: "불국사 문화유산 재단" },
  { id: "static-3", name: "종묘 제례 보존회" },
  { id: "static-4", name: "한옥마을 보존 사업" },
];

/**
 * 챗봇이 수집하는 항목. server/src/routes/heritage.js의 CHAT_FIELDS와 key가 같아야
 * ChatWidget이 돌려주는 값을 폼 state에 그대로 합칠 수 있다(onValues 참고).
 * 후원 대상(target/heritageId)은 위 카드에서 고르므로 챗봇 수집 대상에서 뺀다.
 */
const CHAT_FIELDS = [
  { key: "amount", label: "후원 금액", type: "number", required: true },
  { key: "period", label: "후원 주기", type: "select", options: ["매월 자동이체", "일시 후원", "연 1회"], required: true },
  { key: "donorName", label: "이름", type: "text", required: true },
  { key: "donorPhone", label: "연락처", type: "text", required: true },
];

/**
 * 문화유산 후원.
 *
 * 후원 대상 목록은 국가유산청 문화유산 Open API(data.go.kr)에서 실시간으로 가져온다
 * (server/src/lib/heritage.js 참고). 연동이 설정돼 있지 않거나 실패하면 서버가
 * 정적 목록으로 폴백해서 응답하므로, 화면은 항상 정상적으로 그려진다.
 *
 * 접수는 전자서명이 필요한 정기 약정(①~④ 챗봇 플로우)과는 별도로, 신청 내용만
 * 저장하는 단순 접수 엔드포인트(POST /api/heritage/pledges)로 실제로 연결돼 있다
 * (server/src/routes/heritage.js, lib/heritageStore.js 참고). 후원처별 전자계약
 * 연동이 준비되면 그 위에 서명 요청을 얹으면 된다.
 */
export default function HeritageSupport() {
  const [heritages, setHeritages] = useState(FALLBACK_HERITAGES);
  const [source, setSource] = useState("static");

  useEffect(() => {
    api
      .listHeritages()
      .then((res) => {
        if (res.items && res.items.length) setHeritages(res.items);
        setSource(res.source || "static");
      })
      .catch(() => {}); // 실패해도 위 기본 목록 그대로 사용
  }, []);

  const [form, setForm] = useState({
    target: FALLBACK_HERITAGES[0].name,
    heritageId: FALLBACK_HERITAGES[0].id,
    amount: "",
    period: "매월 자동이체",
    donorName: "",
    donorPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [chatLog, setChatLog] = useState([]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectTarget = (c) => setForm((f) => ({ ...f, target: c.name, heritageId: c.id }));

  const selectTargetByName = (name) => {
    const item = heritages.find((c) => c.name === name);
    setForm((f) => ({ ...f, target: name, heritageId: item?.id || null }));
  };

  // 챗봇이 알아낸 값(amount/period/donorName/donorPhone)을 폼 state에 그대로 합친다
  const applyChatValues = (values) => setForm((f) => ({ ...f, ...values }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await api.createHeritagePledge({
        target: form.target,
        heritageId: form.heritageId,
        amount: Number(form.amount),
        period: form.period,
        donorName: form.donorName,
        donorPhone: form.donorPhone,
        source,
      });
      rememberHeritageId(res.pledge.id);
      setResult(res.pledge);
      // 챗봇과 나눈 대화를 신청 접수 시점에 함께 저장한다 (유산기부의 녹음 저장과 같은
      // 결 — 다시 불러와 보여줄 필요는 없으므로 실패해도 신청 접수 자체는 막지 않는다)
      if (chatLog.some((m) => m.role === "user")) {
        api.saveHeritageChatLog(res.pledge.id, chatLog).catch(() => {});
        // 마이페이지에서 다시 볼 수 있도록 실제로 저장한다 (위 saveHeritageChatLog는 로그만 남김)
        api
          .saveChatHistory({
            context: "문화유산 후원",
            programId: form.heritageId,
            programName: form.target,
            relatedId: res.pledge.id,
            messages: chatLog,
          })
          .then((r) => rememberChatHistoryId(r.conversation.id))
          .catch(() => {});
      }
    } catch (err) {
      if (err.code === "INVALID_INPUT" && err.data?.fields) {
        setError(Object.values(err.data.fields).join(" "));
      } else {
        setError(err.message || "신청 접수에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setResult(null);
    setError("");
    setForm((f) => ({ ...f, amount: "", donorName: "", donorPhone: "" }));
  };

  return (
    <Layout title="문화유산 후원" subtitle="소중한 문화유산의 미래를 함께 지켜주세요">
      <Card
        title="후원 대상 둘러보기"
        subtitle={source === "live" ? "국가유산청 Open API 실시간 데이터예요." : "담당자가 정리해둔 목록이에요."}
      >
        <div className="photo-grid">
          {heritages.slice(0, 8).map((c) => (
            <button
              key={c.id || c.name}
              type="button"
              className="photo-card"
              style={{
                textAlign: "left",
                cursor: "pointer",
                border: form.target === c.name ? "2px solid var(--accent)" : undefined,
              }}
              onClick={() => selectTarget(c)}
            >
              {c.image ? (
                <img className="photo-card-img" src={c.image} alt={c.name} loading="lazy" />
              ) : (
                <div className="photo-card-placeholder">
                  <Icon name={categoryIcon(c)} size={30} />
                </div>
              )}
              <div className="photo-card-body">
                <div className="photo-card-title">{c.name}</div>
                <div className="photo-card-meta">{[c.region, c.category].filter(Boolean).join(" · ")}</div>
              </div>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          카드를 누르면 아래 신청 폼의 후원 대상이 바로 선택돼요.
        </p>
      </Card>

      {!result && (
        <ChatWidget
          title="AI 상담사와 대화로 신청서 채우기"
          fields={CHAT_FIELDS}
          chatFn={api.heritageChat}
          values={form}
          onValues={applyChatValues}
          onMessagesChange={setChatLog}
        />
      )}

      <Card title="후원 신청하기">
        {result ? (
          <>
            <div className="alert alert-success">
              <strong>{result.target}</strong> 후원 신청이 접수됐어요. 담당자가 확인 후 안내드릴게요.
            </div>
            <table className="info-table">
              <tbody>
                <tr>
                  <th>후원 대상</th>
                  <td>{result.target}</td>
                </tr>
                <tr>
                  <th>후원 금액</th>
                  <td>{Number(result.amount).toLocaleString()}원</td>
                </tr>
                <tr>
                  <th>후원 주기</th>
                  <td>{result.period}</td>
                </tr>
                <tr>
                  <th>신청 번호</th>
                  <td>{result.id}</td>
                </tr>
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={startOver}>
              다른 후원 신청하기
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="alert alert-info">
              전자서명 없이 신청 내용만 접수돼요. 담당자가 확인 후 별도로 연락드려요.
              {source === "live" && " (아래 목록은 국가유산청 Open API 실시간 데이터예요.)"}
            </div>
            <div className="field-grid">
              <div className="field">
                <label>후원 대상 문화유산</label>
                <select value={form.target} onChange={(e) => selectTargetByName(e.target.value)}>
                  {heritages.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                      {c.region ? ` · ${c.region}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>후원 금액 (원)</label>
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  placeholder="예: 30000"
                  value={form.amount}
                  onChange={update("amount")}
                  required
                />
              </div>
              <div className="field">
                <label>후원 주기</label>
                <select value={form.period} onChange={update("period")}>
                  <option value="매월 자동이체">매월 자동이체</option>
                  <option value="일시 후원">일시 후원</option>
                  <option value="연 1회">연 1회</option>
                </select>
              </div>
              <div className="field">
                <label>이름</label>
                <input value={form.donorName} onChange={update("donorName")} placeholder="후원자 이름" required />
              </div>
              <div className="field">
                <label>연락처</label>
                <input value={form.donorPhone} onChange={update("donorPhone")} placeholder="010-0000-0000" required />
              </div>
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
              {submitting ? "접수 중..." : "후원 신청하기"}
            </button>
          </form>
        )}
      </Card>
    </Layout>
  );
}
