import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import StepIndicator from "../components/StepIndicator.jsx";
import { api } from "../api.js";
import { usePledgeFlow, TYPE_LABEL } from "../context/PledgeContext.jsx";

const FIELDS = [
  ["target", "후원 대상"],
  ["amount", "후원 금액"],
  ["period", "후원 주기 / 기간"],
  ["startDate", "시작일"],
  ["donorName", "후원자 이름"],
  ["donorPhone", "후원자 연락처"],
];

export default function PledgeConfirm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pledge: ctxPledge, setPledge } = usePledgeFlow();
  const [pledge, setLocalPledge] = useState(ctxPledge?.id === id ? ctxPledge : null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(!pledge);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pledge) {
      setForm(pledge);
      return;
    }
    api
      .getPledge(id)
      .then((res) => {
        setLocalPledge(res.pledge);
        setForm(res.pledge);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.updatePledge(id, form);
      setLocalPledge(res.pledge);
      setPledge(res.pledge);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    setPledge(pledge);
    navigate(`/pledge/${id}/generate`);
  };

  if (loading) {
    return (
      <Layout title="약속 내용 확정">
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  if (!pledge) {
    return (
      <Layout title="약속 내용 확정">
        <div className="alert alert-danger">{error || "약속 정보를 찾을 수 없습니다."}</div>
      </Layout>
    );
  }

  return (
    <Layout title="약속 내용 확정" subtitle="입력하신 내용이 맞는지 확인해주세요">
      <StepIndicator current={0} />
      {error && <div className="alert alert-danger">{error}</div>}
      <Card title={TYPE_LABEL[pledge.type] || "기부 약정"} subtitle="본인 확인 및 약속 내용">
        {!editing ? (
          <>
            <table className="info-table">
              <tbody>
                {FIELDS.map(([key, label]) => (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>{pledge[key] || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 14 }}>{pledge.declaration}</p>
            <div className="gap-12 mt-24">
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                내용 수정하기
              </button>
              <button className="btn btn-primary btn-lg" onClick={handleNext}>
                확인했습니다, 다음 단계로
              </button>
            </div>
          </>
        ) : (
          <>
            {FIELDS.map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input value={form[key] || ""} onChange={update(key)} />
              </div>
            ))}
            <div className="gap-12">
              <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                취소
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "저장중..." : "저장하기"}
              </button>
            </div>
          </>
        )}
      </Card>
    </Layout>
  );
}
