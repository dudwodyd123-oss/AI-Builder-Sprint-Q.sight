import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

export default function LegacyApplication() {
  const navigate = useNavigate();
  const { setPledge } = usePledgeFlow();
  const [form, setForm] = useState({
    target: "",
    assetType: "현금",
    amount: "",
    period: "상속 개시 시",
    donorName: "",
    donorPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.target || !form.amount || !form.donorName || !form.donorPhone) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const { pledge } = await api.createPledge({
        type: "legacy",
        target: form.target,
        amount: `${form.assetType} · ${form.amount}`,
        period: form.period,
        startDate: new Date().toISOString().slice(0, 10),
        donorName: form.donorName,
        donorPhone: form.donorPhone,
        declaration: "본인은 자유로운 의사에 따라 사후 자산의 일부를 위 대상에 기부할 것을 약정합니다.",
        extra: "유산기부 약정은 법정 절차(유언 공증 등)와 별도로 진행되며, 담당자가 추후 안내드립니다.",
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
    <Layout title="유산 기부 신청" subtitle="사후에도 이어지는 따뜻한 마음">
      <Card title="유산기부 신청서">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>후원 대상 (단체 또는 캠페인)</label>
            <input value={form.target} onChange={update("target")} placeholder="예: OO 재단 아동복지기금" />
          </div>
          <div className="field">
            <label>기부 자산 유형</label>
            <select value={form.assetType} onChange={update("assetType")}>
              <option value="현금">현금</option>
              <option value="부동산">부동산</option>
              <option value="보험금">보험금</option>
              <option value="유가증권">유가증권</option>
            </select>
          </div>
          <div className="field">
            <label>기부 비율 또는 금액</label>
            <input value={form.amount} onChange={update("amount")} placeholder="예: 자산의 10% 또는 5,000만원" />
          </div>
          <div className="field">
            <label>이행 시점</label>
            <select value={form.period} onChange={update("period")}>
              <option value="상속 개시 시">상속 개시 시</option>
              <option value="사후 즉시">사후 즉시</option>
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
