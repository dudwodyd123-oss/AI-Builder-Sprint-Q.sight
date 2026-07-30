import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { TYPE_LABEL } from "../context/PledgeContext.jsx";

const STATUS_LABEL = {
  generated: "서명 대기",
  ON_PROCESSING: "요청 처리중",
  ON_GOING: "서명 진행중",
  COMPLETED: "완료",
  ABORTED: "취소됨",
};

function statusClass(status) {
  if (status === "COMPLETED") return "badge-success";
  if (status === "ABORTED") return "badge-muted";
  return "badge-pending";
}

export default function Documents() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [pledges, setPledges] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listDocuments(), api.listPledges()])
      .then(([docRes, pledgeRes]) => {
        setDocuments(docRes.documents || []);
        const map = {};
        (pledgeRes.pledges || []).forEach((p) => (map[p.id] = p));
        setPledges(map);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const refreshStatus = async (docId) => {
    setRefreshingId(docId);
    try {
      const res = await api.getDocumentStatus(docId);
      setDocuments((docs) => docs.map((d) => (d.id === docId ? res.document : d)));
    } catch {
      // 상태 조회 실패는 조용히 무시
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <Layout title="나의 증서함" subtitle="지금까지 생성한 약정서와 서명 상태를 확인하세요">
      <Card>
        {loading ? (
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>
            아직 생성된 약정서가 없어요. 새로운 약속을 시작하면 이곳에서 확인할 수 있어요.
          </p>
        ) : (
          <div className="doc-list">
            {documents
              .slice()
              .reverse()
              .map((doc) => {
                const pledge = pledges[doc.pledgeId];
                return (
                  <div className="doc-row" key={doc.id}>
                    <div>
                      <div className="title">{doc.title}</div>
                      <div className="meta">
                        {pledge ? TYPE_LABEL[pledge.type] : ""} · {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                    <div className="gap-12" style={{ alignItems: "center" }}>
                      <span className={`badge ${statusClass(doc.status)}`}>{STATUS_LABEL[doc.status] || doc.status}</span>
                      {doc.modusignDocumentId && doc.status !== "COMPLETED" && (
                        <button className="btn btn-ghost" onClick={() => refreshStatus(doc.id)} disabled={refreshingId === doc.id}>
                          {refreshingId === doc.id ? "확인중..." : "상태 새로고침"}
                        </button>
                      )}
                      {!doc.modusignDocumentId && pledge && (
                        <button className="btn btn-primary" onClick={() => navigate(`/pledge/${pledge.id}/sign`)}>
                          서명 요청하기
                        </button>
                      )}
                      {doc.downloadUrl && (
                        <a className="btn btn-secondary" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                          다운로드
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </Layout>
  );
}
