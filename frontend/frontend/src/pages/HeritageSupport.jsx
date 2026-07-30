import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const HERITAGES = ["경복궁 보존회", "불국사 문화유산 재단", "종묘 제례 보존회", "한옥마을 보존 사업"];

export default function HeritageSupport() {
  const navigate = useNavigate();
  const { setPledge } = usePledgeFlow();
  const [form, setForm] = useState({
    target: HERITAGES[0],
    amount: "",
    period: "매월 자동이체",
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
        type: "heritage",
        target: form.target,
        amount: `${Number(form.amount).toLocaleString()}원`,
        period: form.period,
        startDate: new Date().toISOString().slice(0, 10),
        donorName: form.donorName,
        donorPhone: form.donorPhone,
        declaration: "본인은 위 문화유산 보존 취지에 동의하며 후원을 약정합니다.",
        extra: "후원금은 문화유산의 보존, 복원, 관리 활동에 사용됩니다.",
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
    <Layout title="문화유산 후원" subtitle="소중한 문화유산의 미래를 함께 지켜주세요">
      <Card title="후원 신청하기">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>후원 대상 문화유산</label>
            <select value={form.target} onChange={update("target")}>
              {HERITAGES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>후원 금액 (원)</label>
            <input type="number" min="10000" step="10000" placeholder="예: 30000" value={form.amount} onChange={update("amount")} />
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
