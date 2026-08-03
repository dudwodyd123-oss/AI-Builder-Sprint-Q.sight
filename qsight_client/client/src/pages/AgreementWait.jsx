import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { usePledgeFlow, STATUS_LABEL } from "../context/PledgeContext.jsx";
import { toSummaryRows } from "../format.js";

/** 모두싸인 rate limit 때문에 폴링 간격은 10초 이상으로 둔다 */
const POLL_INTERVAL = 10000;

export default function AgreementWait() {
  const { agreementId } = useParams();
  const navigate = useNavigate();
  const { agreement, form, values } = usePledgeFlow();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [document, setDocument] = useState(null); // 서명이 끝난 뒤 확인한 문서 정보
  const timerRef = useRef(null);

  const documentId = agreement?.documentId;

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const res = await api.getAgreement(agreementId);
        if (!alive) return;
        setStatus(res);
        if (res.signed || res.status === "REJECTED" || res.status === "CANCELED") {
          clearInterval(timerRef.current);
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    };

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      alive = false;
      clearInterval(timerRef.current);
    };
  }, [agreementId]);

  const signed = Boolean(status?.signed);

  // 서명이 끝나면 약정서 원본을 함께 보여준다.
  // 증서함은 기부자 개인 모두싸인 계정으로 조회하므로, 계정이 없거나 이 문서가
  // 그 계정에 없으면 미리보기를 띄울 수 없다. 그때는 조용히 안내로 대체한다.
  useEffect(() => {
    if (!signed || !documentId || document) return;
    let alive = true;
    api
      .getDocument(documentId)
      .then((res) => alive && setDocument({ ...res.document, available: true }))
      .catch(() => alive && setDocument({ available: false }))
      .finally(() => {});
    return () => {
      alive = false;
    };
  }, [signed, documentId, document]);

  const signerEmail = agreement?.signerEmail;
  const programName = status?.programName || agreement?.programName || "약정";
  const closed = status?.status === "REJECTED" || status?.status === "CANCELED";

  // 대화에서 모은 내용. 새로고침으로 들어오면 남아 있지 않으므로 그때는 생략한다.
  const fields = form?.fields || [];
  const rows = toSummaryRows(fields, values || {}).filter((r) => r.text !== null);
  const prefilled = form?.prefilled_labels || [];
  const fileUrl = documentId ? api.documentFileUrl(documentId) : null;

  return (
    <Layout
      title={signed ? "약정 완료" : "서명 대기"}
      subtitle={signed ? "서명까지 모두 끝났어요" : "메일로 받은 링크에서 서명을 완료해주세요"}
      wide={signed}
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title={programName}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <span className="text-muted" style={{ fontSize: 13.5 }}>현재 상태</span>
          <span className={`badge ${signed ? "badge-success" : closed ? "badge-muted" : "badge-pending"}`}>
            {STATUS_LABEL[status?.status] || status?.status || "확인중"}
          </span>
        </div>

        <div className="center-col" style={{ padding: "20px 0" }}>
          {signed ? (
            <>
              <div style={{ marginBottom: 10, color: "var(--accent)" }}><Icon name="celebration" size={42} /></div>
              <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>서명이 완료되었습니다</p>
              <p className="text-muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>
                {status?.signedAt && `${new Date(status.signedAt).toLocaleString("ko-KR")} · `}
                더 하실 일은 없어요. 아래에서 약정 내용과 약정서를 확인하세요.
              </p>
            </>
          ) : closed ? (
            <>
              <div style={{ marginBottom: 10, color: "var(--danger)" }}><Icon name="block" size={42} /></div>
              <p style={{ fontWeight: 700 }}>서명이 완료되지 않았어요.</p>
              <p className="text-muted" style={{ fontSize: 13.5, marginTop: 6 }}>
                다시 진행하려면 약정을 새로 시작해주세요.
              </p>
            </>
          ) : (
            <>
              <div className="spinner" />
              <p className="text-muted" style={{ marginTop: 16, fontSize: 14, textAlign: "center", lineHeight: 1.7 }}>
                {agreement?.message ||
                  `${signerEmail ? `${signerEmail} 으로 ` : ""}서명 요청을 보냈습니다. 메일함에서 서명을 완료해주세요.`}
                <br />
                서명이 끝나면 이 화면이 자동으로 갱신돼요. (10초마다 확인)
              </p>
            </>
          )}
        </div>
      </Card>

      {/* 서명이 끝났을 때만: 무엇을 약속했는지 한 화면에 정리해 보여준다 */}
      {signed && (rows.length > 0 || prefilled.length > 0) && (
        <Card title="약정 내용" subtitle="아래 내용으로 약정서가 만들어졌어요">
          <table className="info-table">
            <tbody>
              <tr>
                <th>모금 사업</th>
                <td>{programName}</td>
              </tr>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th>{row.label}</th>
                  <td>{row.text}</td>
                </tr>
              ))}
              {prefilled.map((p) => (
                <tr key={p.key}>
                  <th>{p.label || p.key}</th>
                  <td>{p.value || <span className="text-muted">기관에서 작성</span>}</td>
                </tr>
              ))}
              <tr>
                <th>서명자</th>
                <td>
                  {agreement?.signerName || "-"}
                  {signerEmail && ` (${signerEmail})`}
                </td>
              </tr>
              <tr>
                <th>서명 시각</th>
                <td>{status?.signedAt ? new Date(status.signedAt).toLocaleString("ko-KR") : "-"}</td>
              </tr>
              <tr>
                <th>약정 번호</th>
                <td style={{ fontSize: 12.5, wordBreak: "break-all" }}>{agreementId}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {signed && (
        <Card title="약정서">
          {document?.available && fileUrl ? (
            <>
              <div className="flex-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <span className="text-muted" style={{ fontSize: 13.5 }}>
                  서명이 들어간 약정서 원본이에요.
                </span>
                <div className="gap-12">
                  <a className="btn btn-secondary" href={fileUrl} target="_blank" rel="noreferrer">
                    새 탭에서 열기
                  </a>
                  <a className="btn btn-ghost" href={fileUrl} download>
                    PDF 저장
                  </a>
                </div>
              </div>
              <iframe title="약정서" className="pdf-preview" src={fileUrl} />
            </>
          ) : document && !document.available ? (
            <div className="alert alert-info" style={{ margin: 0 }}>
              약정서 원본은 서명하신 모두싸인 계정에 보관돼요. 이 브라우저에 연결된 계정에서는
              불러올 수 없어, 메일로 받은 링크나 모두싸인에서 확인해주세요.
            </div>
          ) : documentId ? (
            <div className="center-col" style={{ padding: 24 }}>
              <div className="spinner" />
              <p className="text-muted" style={{ marginTop: 12, fontSize: 13.5 }}>
                약정서를 불러오는 중이에요...
              </p>
            </div>
          ) : (
            <div className="alert alert-info" style={{ margin: 0 }}>
              서명된 약정서는 나의 증서함에서 확인할 수 있어요.
            </div>
          )}
        </Card>
      )}

      {/* 다음에 무엇을 하면 되는지 버튼마다 한 줄로 알려준다 */}
      <Card title={signed ? "여기서 끝이에요" : "지금 하실 일"}>
        <div className="next-steps">
          {signed ? (
            <>
              <button className="next-step" onClick={() => navigate("/documents")}>
                <span className="next-step-icon"><Icon name="history_edu" /></span>
                <span>
                  <strong>나의 증서함</strong>
                  <em>지금 약정서를 포함해 서명한 문서를 모아 봐요</em>
                </span>
              </button>
              <button className="next-step" onClick={() => navigate("/programs")}>
                <span className="next-step-icon"><Icon name="volunteer_activism" /></span>
                <span>
                  <strong>다른 사업도 후원하기</strong>
                  <em>진행 중인 다른 모금 사업을 둘러봐요</em>
                </span>
              </button>
              <button className="next-step" onClick={() => navigate("/home")}>
                <span className="next-step-icon"><Icon name="home" /></span>
                <span>
                  <strong>홈으로</strong>
                  <em>처음 화면으로 돌아가요</em>
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="next-step as-note">
                <span className="next-step-icon"><Icon name="mark_email_read" /></span>
                <span>
                  <strong>메일함에서 서명하기</strong>
                  <em>
                    {signerEmail ? `${signerEmail} 으로 보낸 ` : ""}모두싸인 링크에서 서명을 마치면
                    이 화면이 저절로 바뀌어요
                  </em>
                </span>
              </div>
              <button className="next-step" onClick={() => navigate("/home")}>
                <span className="next-step-icon"><Icon name="home" /></span>
                <span>
                  <strong>나중에 하기</strong>
                  <em>홈으로 나가도 서명 요청은 그대로 남아 있어요</em>
                </span>
              </button>
            </>
          )}
        </div>
      </Card>
    </Layout>
  );
}
