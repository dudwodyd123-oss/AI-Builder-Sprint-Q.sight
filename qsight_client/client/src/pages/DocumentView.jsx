import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { STATUS_LABEL } from "../context/PledgeContext.jsx";

/** 서명한 계약서 원본 보기. PDF는 서버가 모두싸인에서 받아 흘려보낸다. */
export default function DocumentView() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDocument(documentId)
      .then((res) => setDocument(res.document))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <Layout title="약정서 보기">
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="약정서 보기">
        <div className="alert alert-danger">{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate("/documents")}>
          증서함으로 돌아가기
        </button>
      </Layout>
    );
  }

  const fileUrl = api.documentFileUrl(documentId);

  return (
    <Layout title="약정서 보기" subtitle={document.title} wide>
      <Card>
        <div className="flex-between">
          <div>
            <div className="text-muted" style={{ fontSize: 13 }}>서명 상태</div>
            <div style={{ marginTop: 6 }}>
              <span className={`badge ${document.signed ? "badge-success" : "badge-pending"}`}>
                {STATUS_LABEL[document.status] || document.status}
              </span>
            </div>
          </div>
          <div className="gap-12">
            <a className="btn btn-secondary" href={fileUrl} target="_blank" rel="noreferrer">
              새 탭에서 열기
            </a>
            <button className="btn btn-ghost" onClick={() => navigate("/documents")}>
              증서함으로
            </button>
          </div>
        </div>

        <table className="info-table" style={{ marginTop: 16 }}>
          <tbody>
            {document.requesterName && (
              <tr>
                <th>보낸 곳</th>
                <td>{document.requesterName}</td>
              </tr>
            )}
            {document.participants.length > 0 && (
              <tr>
                <th>서명자</th>
                <td>
                  {document.participants
                    .map((p) => (p.email ? `${p.name} (${p.email})` : p.name))
                    .join(", ")}
                </td>
              </tr>
            )}
            {document.updatedAt && (
              <tr>
                <th>최근 변경</th>
                <td>{new Date(document.updatedAt).toLocaleString("ko-KR")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="약정서 원본">
        {document.signed ? (
          <iframe title={document.title} className="pdf-preview" src={fileUrl} />
        ) : (
          <div className="alert alert-info" style={{ margin: 0 }}>
            아직 서명이 완료되지 않아 최종 약정서를 볼 수 없어요. 메일로 받은 링크에서 서명을 마치면 여기에 표시돼요.
          </div>
        )}
      </Card>
    </Layout>
  );
}
