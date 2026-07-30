import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import StepIndicator from "../components/StepIndicator.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const STATUS_LABEL = {
  generated: "서명 요청 전",
  ON_PROCESSING: "서명 요청 처리중",
  ON_GOING: "서명 진행중",
  COMPLETED: "서명 완료",
  ABORTED: "서명 취소됨",
};

export default function PledgeSign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { document: ctxDoc, setDocument } = usePledgeFlow();
  const [pledge, setPledge] = useState(null);
  const [document, setDoc] = useState(ctxDoc?.pledgeId === id ? ctxDoc : null);
  const [form, setForm] = useState({ signerName: "", signerEmail: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    api.getPledge(id).then((res) => {
      setPledge(res.pledge);
      setForm((f) => ({ ...f, signerName: res.pledge.donorName || "" }));
      if (!document && res.pledge.documentId) {
        api.getDocument(res.pledge.documentId).then((r) => setDoc(r.document)).catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  const startPolling = (docId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getDocumentStatus(docId);
        setDoc(res.document);
        setDocument(res.document);
        if (res.document.status === "COMPLETED" || res.document.status === "ABORTED") {
          clearInterval(pollRef.current);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 5000);
  };

  const handleSign = async (e) => {
    e.preventDefault();
    if (!document) return;
    setSending(true);
    setError("");
    try {
      const res = await api.signDocument(document.id, form);
      setDoc(res.document);
      setDocument(res.document);
      startPolling(document.id);
    } catch (err) {
      setError(
        `${err.message} (ModuSign 연동 오류일 수 있어요. server/.env의 MODUSIGN_EMAIL / MODUSIGN_API_KEY를 확인해주세요.)`
      );
    } finally {
      setSending(false);
    }
  };

  if (!pledge || !document) {
    return (
      <Layout title="전자서명">
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  const requested = Boolean(document.modusignDocumentId);

  return (
    <Layout title="전자서명" subtitle="모두싸인을 통해 안전하게 서명을 완료해요">
      <StepIndicator current={3} />
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title={document.title}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <span className="text-muted" style={{ fontSize: 13.5 }}>현재 상태</span>
          <span className={`badge ${document.status === "COMPLETED" ? "badge-success" : "badge-pending"}`}>
            {STATUS_LABEL[document.status] || document.status}
          </span>
        </div>

        {!requested ? (
          <form onSubmit={handleSign}>
            <div className="field">
              <label>서명자 이름</label>
              <input
                value={form.signerName}
                onChange={(e) => setForm((f) => ({ ...f, signerName: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>서명자 이메일</label>
              <input
                type="email"
                value={form.signerEmail}
                onChange={(e) => setForm((f) => ({ ...f, signerEmail: e.target.value }))}
                placeholder="서명 요청 링크를 받을 이메일"
                required
              />
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={sending}>
              {sending ? "전송중..." : "전자서명 요청 보내기"}
            </button>
          </form>
        ) : (
          <div className="center-col" style={{ padding: "20px 0" }}>
            {document.status !== "COMPLETED" ? (
              <>
                <div className="spinner" />
                <p className="text-muted" style={{ marginTop: 16, fontSize: 14 }}>
                  {form.signerEmail || document.signerEmail}로 서명 요청을 보냈어요. 서명이 완료되면 자동으로 갱신돼요.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 42, marginBottom: 10 }}>🎉</div>
                <p style={{ fontWeight: 700 }}>서명이 완료되었어요!</p>
              </>
            )}
            <button className="btn btn-secondary" style={{ marginTop: 18 }} onClick={() => navigate("/documents")}>
              나의 증서함에서 확인하기
            </button>
          </div>
        )}
      </Card>
    </Layout>
  );
}
