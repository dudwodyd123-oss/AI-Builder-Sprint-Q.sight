import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import { api } from "../api.js";
import { rememberHometownId } from "../hometownLocal.js";
import { rememberChatHistoryId } from "../chatHistoryLocal.js";

/* 답례품 분류별 아이콘 — 실제 사진이 없을 때만 쓰는 대체 표시라, 출처가 불분명한
   이미지를 가져다 쓰지 않고 우리가 그린 아이콘 + 그라디언트로 대신한다. */
const CATEGORY_ICON = {
  관광: "flight_takeoff",
  농축산물: "eco",
  수산물: "set_meal",
  가공식품: "restaurant",
  생활용품: "home_repair_service",
  상품권: "confirmation_number",
};

function categoryIcon(category) {
  if (!category) return "redeem";
  const key = Object.keys(CATEGORY_ICON).find((k) => category.includes(k));
  return key ? CATEGORY_ICON[key] : "redeem";
}

const FALLBACK_CITIES = ["강원 양양군", "전남 담양군", "경북 의성군", "충남 청양군", "제주 서귀포시"];

function formatWon(v) {
  if (typeof v !== "number") return null;
  return `${v.toLocaleString()}원`;
}

/** 세액공제 예상액 — 10만원까지 전액, 초과분은 16.5% (실제 제도 규정 그대로). */
function estimateTaxCredit(amount) {
  if (!amount || amount <= 0) return 0;
  if (amount <= 100000) return amount;
  return Math.round(100000 + (amount - 100000) * 0.165);
}

/**
 * 챗봇이 수집하는 항목. server/src/routes/hometown.js의 CHAT_FIELDS와 key가 같아야
 * ChatWidget이 돌려주는 값을 폼 state에 그대로 합칠 수 있다(onValues 참고).
 * 기부 대상(target)과 답례품(rewardId)은 위 카드/드롭다운에서 고르므로 챗봇 수집
 * 대상에서 뺀다.
 */
const CHAT_FIELDS = [
  { key: "amount", label: "기부 금액", type: "number", required: true },
  { key: "donorName", label: "이름", type: "text", required: true },
  { key: "donorPhone", label: "연락처", type: "text", required: true },
];

/**
 * 고향사랑기부 안내.
 *
 * 답례품 목록은 server/src/lib/hometownRewards.js를 통해 가져온다. 고향사랑e음,
 * busanlove.kr 모두 공개 API가 없어서 (1) 팀이 직접 운영하는 JSON API,
 * (2) 사람이 주기적으로 갱신하는 로컬 JSON 파일, 둘 중 하나를 .env로 선택할 수 있고,
 * 둘 다 없으면 서버에 미리 담아둔 샘플 데이터로 표시된다 — 화면은 항상 정상 동작한다.
 *
 * 접수(신청 생성)는 전자서명 없이 신청 내용만 저장하는 단순 접수 엔드포인트
 * (POST /api/hometown/pledges)로 실제로 연결돼 있다
 * (server/src/routes/hometown.js, lib/hometownStore.js 참고). 지자체 시스템과의
 * 실제 접수 연동이 준비되면 그 위에 얹으면 된다.
 */
export default function HometownGuide() {
  const [rewards, setRewards] = useState([]);
  const [source, setSource] = useState("static");

  useEffect(() => {
    api
      .listHometownRewards()
      .then((res) => {
        setRewards(res.items || []);
        setSource(res.source || "static");
      })
      .catch(() => {});
  }, []);

  const cityOptions = rewards.length
    ? [...new Set(rewards.map((r) => r.region).filter(Boolean))]
    : FALLBACK_CITIES;

  const [form, setForm] = useState({
    target: FALLBACK_CITIES[0],
    rewardId: null,
    amount: "",
    donorName: "",
    donorPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [chatLog, setChatLog] = useState([]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectReward = (r) => setForm((f) => ({ ...f, target: r.region || f.target, rewardId: r.id }));

  // 챗봇이 알아낸 값(amount/donorName/donorPhone)을 폼 state에 그대로 합친다
  const applyChatValues = (values) => setForm((f) => ({ ...f, ...values }));

  const amountNum = Number(form.amount) || 0;
  const taxCredit = estimateTaxCredit(amountNum);
  const rewardCap = Math.floor(amountNum * 0.3);
  const affordableRewards = amountNum
    ? rewards
        .filter((r) => typeof r.minDonation === "number" && r.minDonation <= rewardCap)
        .sort((a, b) => (b.minDonation || 0) - (a.minDonation || 0))
        .slice(0, 3)
    : [];

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await api.createHometownPledge({
        target: form.target,
        rewardId: form.rewardId,
        amount: Number(form.amount),
        donorName: form.donorName,
        donorPhone: form.donorPhone,
        source,
      });
      rememberHometownId(res.pledge.id);
      setResult(res.pledge);
      // 챗봇과 나눈 대화를 신청 접수 시점에 함께 저장한다 (유산기부의 녹음 저장과 같은
      // 결 — 다시 불러와 보여줄 필요는 없으므로 실패해도 신청 접수 자체는 막지 않는다)
      if (chatLog.some((m) => m.role === "user")) {
        api.saveHometownChatLog(res.pledge.id, chatLog).catch(() => {});
        // 마이페이지에서 다시 볼 수 있도록 실제로 저장한다 (위 saveHometownChatLog는 로그만 남김)
        api
          .saveChatHistory({
            context: "고향사랑기부",
            programId: form.rewardId,
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
    <Layout title="고향사랑기부 안내" subtitle="제2의 고향에 마음을 전해보세요">
      <Card title="고향사랑기부제란?" subtitle="지자체에 기부하고 답례품과 세액공제를 받는 제도예요.">
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.8 }}>
          <li>연간 최대 500만원까지 기부할 수 있어요.</li>
          <li>기부금액의 30% 이내에서 지역 특산품 등 답례품을 받아요.</li>
          <li>10만원까지 전액, 초과분은 16.5% 세액공제가 적용돼요.</li>
        </ul>
      </Card>

      {rewards.length > 0 && (
        <Card
          title="답례품 둘러보기"
          subtitle={source === "live" ? "실시간으로 연동된 답례품 목록이에요." : "담당자가 정리해둔 답례품 목록이에요."}
        >
          <div className="photo-grid">
            {rewards.slice(0, 6).map((r) => (
              <button
                key={r.id || r.name}
                type="button"
                className="photo-card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border: form.rewardId === r.id ? "2px solid var(--accent)" : undefined,
                }}
                onClick={() => selectReward(r)}
              >
                {r.image ? (
                  <img className="photo-card-img" src={r.image} alt={r.name} loading="lazy" />
                ) : (
                  <div className="photo-card-placeholder">
                    <Icon name={categoryIcon(r.category)} size={30} />
                  </div>
                )}
                <div className="photo-card-body">
                  <div className="photo-card-title">{r.name}</div>
                  <div className="photo-card-meta">
                    {[r.region, r.category].filter(Boolean).join(" · ")}
                  </div>
                  {formatWon(r.minDonation) && (
                    <span className="badge badge-muted" style={{ marginTop: 6, display: "inline-block" }}>
                      {formatWon(r.minDonation)}~
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            카드를 누르면 아래 신청 폼의 기부 대상과 답례품이 바로 선택돼요.
          </p>
        </Card>
      )}

      {!result && (
        <ChatWidget
          title="AI 상담사와 대화로 신청서 채우기"
          fields={CHAT_FIELDS}
          chatFn={api.hometownChat}
          values={form}
          onValues={applyChatValues}
          onMessagesChange={setChatLog}
        />
      )}

      <Card title="기부 신청하기">
        {result ? (
          <>
            <div className="alert alert-success">
              <strong>{result.target}</strong> 기부 신청이 접수됐어요. 담당자가 확인 후 안내드릴게요.
            </div>
            <table className="info-table">
              <tbody>
                <tr>
                  <th>기부 대상</th>
                  <td>{result.target}</td>
                </tr>
                <tr>
                  <th>기부 금액</th>
                  <td>{Number(result.amount).toLocaleString()}원</td>
                </tr>
                <tr>
                  <th>신청 번호</th>
                  <td>{result.id}</td>
                </tr>
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={startOver}>
              다른 기부 신청하기
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="alert alert-info">
              전자서명 없이 신청 내용만 접수돼요. 담당자가 확인 후 별도로 연락드려요.
              {source === "live" && " (위 답례품 목록은 실시간으로 연동된 데이터예요.)"}
            </div>
            <div className="field-grid">
              <div className="field">
                <label>기부할 지자체</label>
                <select value={form.target} onChange={update("target")}>
                  {cityOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>기부 금액 (원)</label>
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  placeholder="예: 100000"
                  value={form.amount}
                  onChange={update("amount")}
                  required
                />
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

            {amountNum > 0 && (
              <div className="alert alert-info" style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  예상 세액공제 {formatWon(taxCredit)}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.7 }}>
                  답례품은 기부금의 30%인 {formatWon(rewardCap)}까지 받을 수 있어요.
                  {affordableRewards.length > 0 ? (
                    <>
                      {" "}
                      이 금액이면{" "}
                      {affordableRewards.map((r, i) => (
                        <span key={r.id || r.name}>
                          {i > 0 && ", "}
                          <strong>{r.name}</strong>
                        </span>
                      ))}
                      {" "}같은 답례품을 받을 수 있어요.
                    </>
                  ) : rewards.length > 0 ? (
                    " 이 금액대에 맞는 답례품은 목록에서 조건에 맞는 항목이 없어요."
                  ) : null}
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
              {submitting ? "접수 중..." : "기부 신청하기"}
            </button>
          </form>
        )}
      </Card>
    </Layout>
  );
}
