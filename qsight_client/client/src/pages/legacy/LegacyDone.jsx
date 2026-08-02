import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import SpeakButton from "../../components/SpeakButton.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { STATUS_LABEL } from "../../context/PledgeContext.jsx";

/**
 * [9] 완료 + 다음 단계 안내.
 *
 * 문구는 전부 spec.notices에서 온다. "유효한 유언이 완성되었습니다" 같은 표현을
 * 화면에 적지 않기 위해서다 (spec.forbidden_phrases 참고).
 *
 * 마지막 화면이므로 여기서 다 보여주고 끝낸다 — 서명 결과, 남긴 내용 정리,
 * 읽은 대본, 녹음, 약정서 원본. 그리고 다음에 무엇을 하면 되는지까지.
 */
export default function LegacyDone() {
  const { pledgeId } = useParams();
  const navigate = useNavigate();
  const { spec } = useLegacySpec();

  const [pledge, setPledge] = useState(null);
  const [script, setScript] = useState(null);
  const [agreement, setAgreementStatus] = useState(null);
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getLegacyPledge(pledgeId)
      .then((res) => {
        setPledge(res.pledge);
        setScript(res.script);
        // 서명은 메일에서 이뤄지므로 여기서는 한 번만 상태를 확인해 보여준다
        if (res.pledge.agreementId) {
          api.getAgreement(res.pledge.agreementId).then(setAgreementStatus).catch(() => {});
        }
        // 서명된 약정서 원본. 개인 모두싸인 계정으로 못 여는 경우가 있어 실패를 구분한다.
        if (res.pledge.documentId) {
          api
            .getDocument(res.pledge.documentId)
            .then((d) => setDocument({ ...d.document, available: true }))
            .catch(() => setDocument({ available: false }));
        }
      })
      .catch((err) => setError(err.message));
  }, [pledgeId]);

  const checklistDone =
    (pledge?.checklist || []).length > 0 && pledge.checklist.every((c) => c.checked);
  const signed = Boolean(agreement?.signed);
  const values = pledge?.values || {};
  const fileUrl = pledge?.documentId ? api.documentFileUrl(pledge.documentId) : null;

  /**
   * 남긴 내용 정리 — 대본에 들어간 항목을 spec 순서대로 보여준다.
   * 재산 특정 방식의 하위 항목(비율·금액 등)은 그 방식 바로 뒤에 붙인다.
   */
  const selectedType = (spec?.bequest_types || []).find((t) => t.label === values.bequest_type);
  const summaryRows = (spec?.collect || [])
    .flatMap((f) =>
      f.key === "bequest_type" ? [f, ...(selectedType?.fields || [])] : [f]
    )
    .map((f) => ({ key: f.key, label: f.label, text: values[f.key] }))
    .filter((r) => r.text !== undefined && String(r.text).trim() !== "");

  return (
    <Layout title="유산기부 완료" subtitle="남겨주신 마음이 잘 기록되었어요" wide>
      <LegacySteps current={9} />
      {error && <div className="alert alert-danger">{error}</div>}

      <Card>
        <div className="center-col" style={{ padding: "16px 0 6px" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🕊️</div>
          <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
            {signed ? "서명이 완료되었습니다" : "녹음이 저장되었습니다"}
          </p>
          <p className="text-muted" style={{ fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 1.7 }}>
            {pledge?.programName || "유산기부"}
            {pledge?.recording &&
              ` · ${new Date(pledge.recording.recordedAt).toLocaleString("ko-KR")} 녹음`}
            <br />
            {signed
              ? "더 하실 일은 없어요. 아래에서 남기신 내용과 약정서를 확인하세요."
              : "기부 의사 등록은 메일에서 서명을 마치면 완료돼요."}
          </p>
        </div>

        {checklistDone && (
          <div className="alert alert-info" style={{ marginTop: 8 }}>
            {spec?.notices?.done_result}
          </div>
        )}
      </Card>

      <Card title="남기신 내용" subtitle="녹음과 약정서에 들어간 내용이에요">
        <table className="info-table">
          <tbody>
            <tr>
              <th>대상 사업</th>
              <td>{pledge?.programName || "-"}</td>
            </tr>
            {summaryRows.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{String(row.text)}</td>
              </tr>
            ))}
            <tr>
              <th>증인</th>
              <td>{pledge?.witness?.name || "-"}</td>
            </tr>
            <tr>
              <th>자가 확인</th>
              <td>
                <span className={`badge ${checklistDone ? "badge-success" : "badge-muted"}`}>
                  {(pledge?.checklist || []).filter((c) => c.checked).length} /{" "}
                  {(pledge?.checklist || []).length} 확인
                </span>
              </td>
            </tr>
            <tr>
              <th>기부 의사 등록</th>
              <td>
                {pledge?.agreementId ? (
                  <span className={`badge ${signed ? "badge-success" : "badge-pending"}`}>
                    {signed ? "서명 완료" : STATUS_LABEL[agreement?.status] || "서명 대기 중"}
                  </span>
                ) : (
                  <span className="badge badge-muted">등록 안 됨</span>
                )}
              </td>
            </tr>
            <tr>
              <th>기관 통보</th>
              <td>
                {pledge?.corpNotifiedAt ? (
                  <>
                    <span className="badge badge-success">
                      {pledge.corpNotifiedStatus === "verified" ? "녹음 확인 완료 전달" : "녹음 저장 전달"}
                    </span>
                    <span className="text-muted" style={{ fontSize: 12.5, marginLeft: 8 }}>
                      {new Date(pledge.corpNotifiedAt).toLocaleString("ko-KR")}
                    </span>
                  </>
                ) : (
                  <span className="badge badge-muted">전달 대기</span>
                )}
              </td>
            </tr>
            <tr>
              <th>등록 번호</th>
              <td style={{ fontSize: 12.5, wordBreak: "break-all" }}>{pledgeId}</td>
            </tr>
          </tbody>
        </table>

        {pledge?.agreementId && !signed && (
          <p className="hint">
            서명 요청 메일이 아직 남아 있어요. 메일함에서 서명을 마치면 기관에 정식으로 등록됩니다.
          </p>
        )}
      </Card>

      {pledge?.recording && (
        <Card title="녹음한 유언" subtitle="읽으신 대본과 녹음이에요">
          <audio className="legacy-audio" controls src={api.legacyRecordingUrl(pledgeId)} />
          <pre className="script-record">{pledge.scriptRendered || script?.text}</pre>
          <p className="hint">
            파일 지문(SHA-256) {pledge.recording.sha256}
            <br />
            문안 버전 {pledge.specVersion} · 이 지문으로 파일이 바뀌지 않았음을 확인할 수 있어요.
          </p>
        </Card>
      )}

      {pledge?.documentId && (
        <Card title="약정서">
          {document?.available && signed && fileUrl ? (
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
          ) : (
            <div className="alert alert-info" style={{ margin: 0 }}>
              {signed
                ? "약정서 원본은 서명하신 모두싸인 계정에 보관돼요. 이 브라우저에 연결된 계정에서는 불러올 수 없어, 메일로 받은 링크에서 확인해주세요."
                : "서명이 끝나면 여기에 약정서 원본이 표시돼요."}
            </div>
          )}
        </Card>
      )}

      <Card title="앞으로 필요한 일">
        <ul className="legacy-flow">
          {(spec?.notices?.done_next || []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {/* 검인 절차·가족 고지처럼 나중에 실제로 해야 하는 일이라 놓치면 안 된다 */}
        <div style={{ marginTop: 12 }}>
          <SpeakButton
            text={[spec?.notices?.done_result, ...(spec?.notices?.done_next || [])]}
            label="결과와 앞으로 할 일 들어보기"
          />
        </div>
        <p className="hint">
          녹음 파일과 유언 내용은 기관에 보내지 않고 이 서비스에만 보관됩니다. 생전에 기관이
          유언 내용을 열람하지 않도록 하기 위해서예요. 기관에는 <strong>녹음을 마쳤다는 사실</strong>과
          녹음 시각·파일 지문만 전달됩니다.
        </p>
      </Card>

      <Card title="여기서 끝이에요">
        <div className="next-steps">
          {pledge?.agreementId && !signed && (
            <button
              className="next-step"
              onClick={() => navigate(`/agreements/${pledge.agreementId}`)}
            >
              <span className="next-step-icon">✍️</span>
              <span>
                <strong>서명 상태 보기</strong>
                <em>메일에서 서명을 마쳤는지 확인해요</em>
              </span>
            </button>
          )}
          <button className="next-step" onClick={() => navigate("/mypage")}>
            <span className="next-step-icon">👤</span>
            <span>
              <strong>마이페이지</strong>
              <em>이 유산기부 등록을 나중에 다시 열어볼 수 있어요</em>
            </span>
          </button>
          <button className="next-step" onClick={() => navigate("/documents")}>
            <span className="next-step-icon">📜</span>
            <span>
              <strong>나의 증서함</strong>
              <em>서명한 문서를 모아 봐요</em>
            </span>
          </button>
          <button className="next-step" onClick={() => navigate("/home")}>
            <span className="next-step-icon">🏠</span>
            <span>
              <strong>홈으로</strong>
              <em>처음 화면으로 돌아가요</em>
            </span>
          </button>
        </div>
      </Card>
    </Layout>
  );
}
