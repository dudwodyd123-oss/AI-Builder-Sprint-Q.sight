import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const CITIES = ["강원 양양군", "전남 담양군", "경북 의성군", "충남 청양군", "제주 서귀포시"];

export default function HometownGuide() {
  const navigate = useNavigate();
  const { setPledge } = usePledgeFlow();
  const [form, setForm] = useState({
    target: CITIES[0],
    amount: "",
    donorName: "",
    donorPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.amount || !form.donorName || !form.donorPhone) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const { pledge } = await api.createPledge({
        type: "hometown",
        target: form.target,
        amount: `${Number(form.amount).toLocaleString()}원`,
        period: "연 1회",
        startDate: new Date().toISOString().slice(0, 10),
        donorName: form.donorName,
        donorPhone: form.donorPhone,
        declaration: "본인은 고향사랑기부제 취지에 동의하며 위 지자체에 기부를 신청합니다.",
        extra: "기부금의 30% 이내에서 지역 답례품이 제공되며, 세액공제 혜택을 받을 수 있습니다.",
      });
      setPledge(pledge);
      navigate(`/pledge/${pledge.id}/confirm`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

      <Card title="기부 신청하기">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>기부할 지자체</label>
            <select value={form.target} onChange={update("target")}>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>기부 금액 (원)</label>
            <input type="number" min="10000" step="10000" placeholder="예: 100000" value={form.amount} onChange={update("amount")} />
          </div>
          <div className="field">
            <label>이름</label>
            <input value={form.donorName} onChange={update("donorName")} placeholder="후원자 이름" />
          </div>
          <div className="field">
            <label>연락처</label>
            <input value={form.donorPhone} onChange={update("donorPhone")} placeholder="010-0000-0000" />
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? "처리중..." : "신청 내용 확인하러 가기"}
          </button>
        </form>
      </Card>
    </Layout>
  );
}
