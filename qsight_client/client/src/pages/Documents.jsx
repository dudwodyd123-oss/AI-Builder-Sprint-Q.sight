import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow, STATUS_LABEL } from "../context/PledgeContext.jsx";

/**
 * 나의 증서함.
 *
 * 목록은 개인 모두싸인 계정에서 온다. 개인용 서버는 약정을 저장하지 않고,
 * 본인이 참여한 문서만 본인 키로 조회한다.
 */
export default function Documents() {
  const navigate = useNavigate();
  const { agreement } = usePledgeFlow();
  const [documents, setDocuments] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [current, setCurrent] = useState(null);
  const [lookupId, setLookupId] = useState("");
  const [looked, setLooked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    api
      .listDocuments()
      .then((res) => {
        setDocuments(res.documents || []);
        setConfigured(res.configured !== false);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!agreement?.agreementId) return;
    api.getAgreement(agreement.agreementId).then(setCurrent).catch(() => {});
  }, [agreement]);

  const lookup = async (e) => {
    e.preventDefault();
    const id = lookupId.trim();
    if (!id) return;
    setLookupError("");
    setLooked(null);
    try {
      setLooked(await api.getAgreement(id));
    } catch (err) {
      setLookupError(err.message);
    }
  };

  return (
    <Layout title="나의 증서함" subtitle="내가 서명한 약정서를 확인하세요">
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title="서명한 약정서" subtitle="모두싸인 계정에서 불러온 문서예요">
        {loading ? (
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : !configured ? (
          <div className="alert alert-info" style={{ margin: 0 }}>
            개인 모두싸인 계정이 아직 연결되지 않았어요. <code>server/.env</code>의
            <code> MODUSIGN_EMAIL</code> / <code>MODUSIGN_API_KEY</code>에 본인 계정 키를 넣으면
            서명한 약정서가 여기에 표시돼요.
          </div>
        ) : documents.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>
            아직 서명한 약정서가 없어요. 새로운 약속을 시작하면 이곳에서 확인할 수 있어요.
          </p>
        ) : (
          <div className="doc-list">
            {documents.map((doc) => (
              <div className="doc-row" key={doc.id}>
                <div>
                  <div className="title">{doc.title}</div>
                  <div className="meta">
                    {doc.requesterName ? `${doc.requesterName} · ` : ""}
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("ko-KR") : ""}
                  </div>
                </div>
                <div className="gap-12" style={{ alignItems: "center" }}>
                  <span className={`badge ${doc.signed ? "badge-success" : "badge-pending"}`}>
                    {STATUS_LABEL[doc.status] || doc.status}
                  </span>
                  <button className="btn btn-primary" onClick={() => navigate(`/documents/${doc.id}`)}>
                    자세히 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {current && !current.signed && (
        <Card title="서명 대기중인 약정" subtitle="메일에서 서명을 완료하면 위 목록에 나타나요">
          <div className="doc-list">
            <div className="doc-row">
              <div>
                <div className="title">{current.programName}</div>
                <div className="meta">{current.agreementId}</div>
              </div>
              <div className="gap-12" style={{ alignItems: "center" }}>
                <span className="badge badge-pending">{STATUS_LABEL[current.status] || current.status}</span>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate(`/agreements/${current.agreementId}`)}
                >
                  진행 상태 보기
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="약정 번호로 상태 조회" subtitle="서명 요청 메일에 안내된 약정 번호를 입력해주세요">
        {lookupError && <div className="alert alert-danger">{lookupError}</div>}
        <form onSubmit={lookup}>
          <div className="field">
            <label>약정 번호</label>
            <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="예: agr_0001" />
          </div>
          <button className="btn btn-secondary" disabled={!lookupId.trim()}>
            상태 조회하기
          </button>
        </form>
        {looked && (
          <div className="doc-list" style={{ marginTop: 16 }}>
            <div className="doc-row">
              <div>
                <div className="title">{looked.programName}</div>
                <div className="meta">{looked.agreementId}</div>
              </div>
              <span className={`badge ${looked.signed ? "badge-success" : "badge-pending"}`}>
                {STATUS_LABEL[looked.status] || looked.status}
              </span>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}
