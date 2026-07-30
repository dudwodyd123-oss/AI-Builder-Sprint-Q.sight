import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import StepIndicator from "../components/StepIndicator.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const FIELDS = [
  ["target", "후원 대상"],
  ["amount", "후원 금액"],
  ["period", "후원 주기 / 기간"],
  ["startDate", "시작일"],
];

export default function PledgeReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { document: ctxDoc, setDocument } = usePledgeFlow();
  const [form, setForm] = useState(null);
  const [pdfBase64, setPdfBase64] = useState(ctxDoc?.pledgeId === id ? ctxDoc.pdfBase64 : null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getPledge(id)
      .then(async (res) => {
        setForm(res.pledge);
        if (!pdfBase64) {
          try {
            const preview = await api.previewDocument(id, res.pledge);
            setPdfBase64(preview.pdfBase64);
          } catch {
            // 미리보기 실패는 조용히 무시 - 사용자가 직접 갱신 버튼을 누를 수 있음
          }
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const refreshPreview = async () => {
    setLoadingPreview(true);
    setError("");
    try {
      const res = await api.previewDocument(id, form);
      setPdfBase64(res.pdfBase64);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const finalizeAndSign = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updatePledge(id, form);
      const { document } = await api.generateDocument(id);
      setDocument(document);
      navigate(`/pledge/${id}/sign`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <Layout title="약정서 확인 및 수정">
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="약정서 확인 및 수정" subtitle="내용을 확인하고 필요하면 자유롭게 수정해주세요" wide>
      <StepIndicator current={2} />
      {error && <div className="alert alert-danger">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card title="약정 내용 수정">
          {FIELDS.map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input value={form[key] || ""} onChange={update(key)} />
            </div>
          ))}
          <div className="field">
            <label>추가 안내 (선택)</label>
            <textarea value={form.extra || ""} onChange={update("extra")} />
          </div>
          <button className="btn btn-ghost btn-block" onClick={refreshPreview} disabled={loadingPreview}>
            {loadingPreview ? "미리보기 생성중..." : "수정 내용으로 미리보기 갱신"}
          </button>
        </Card>

        <Card title="약정서 미리보기">
          {pdfBase64 ? (
            <iframe title="약정서 미리보기" className="pdf-preview" src={`data:application/pdf;base64,${pdfBase64}`} />
          ) : (
            <div className="center-col" style={{ padding: 40 }}>
              <div className="spinner" />
            </div>
          )}
        </Card>
      </div>

      <div className="gap-12 mt-24">
        <button className="btn btn-primary btn-lg" onClick={finalizeAndSign} disabled={saving}>
          {saving ? "저장중..." : "이대로 서명 요청하기"}
        </button>
      </div>
    </Layout>
  );
}
