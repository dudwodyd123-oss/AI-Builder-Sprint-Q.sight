import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";
import { toSummaryRows } from "../../format.js";

/**
 * [5] 의향 등록 — 기존 약정 흐름(③)을 그대로 재사용한다.
 *
 * 녹음보다 서명을 먼저 두는 이유: 서명 요청 메일을 먼저 보내두면 녹음 도중 이탈해도
 * 기부 의사는 기관에 남는다. 반대로 두면 이탈 시 아무것도 남지 않는다. (LEGACY_PLAN.md §1)
 *
 * 약정 항목은 여기서 입력받지 않는다. 챗봇이 대화에서 이미 다 모았으므로 이 화면은
 * 확인만 한다. 서명자 이름·이메일만 따로 받는데, 서명 요청 메일이 갈 주소는 눈으로
 * 한 번 확인받아야 하기 때문이다 (일반 약정의 서명자 정보 화면과 같은 이유).
 */
export default function LegacySign() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { legacy, setLegacy, setAgreement, profile } = usePledgeFlow();

  const [form, setForm] = useState(null); // 기업용 ②가 준 계약 항목 스키마
  const [signer, setSigner] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const values = legacy.values || {};

  useEffect(() => {
    if (!legacy.pledgeId) {
      navigate(`/donate/legacy/${programId}/script`, { replace: true });
      return;
    }
    // 이미 등록을 마친 뒤 뒤로 가거나 새로고침해서 돌아온 경우가 있다.
    // 그대로 다시 제출하면 같은 사람의 약정이 기업용에 두 건 생기고
    // 서명 요청 메일도 다시 나가므로, 서버에 기록된 등록 여부를 먼저 확인한다.
    Promise.all([api.getContractForm(programId, "legacy"), api.getLegacyPledge(legacy.pledgeId)])
      .then(([res, pledgeRes]) => {
        if (pledgeRes.pledge.agreementId) {
          setLegacy({
            agreementId: pledgeRes.pledge.agreementId,
            documentId: pledgeRes.pledge.documentId,
          });
          navigate(`/legacy/${legacy.pledgeId}/witness`, { replace: true });
          return;
        }
        setForm(res.form);
        setSigner({
          name: values.donor_name || profile?.name?.trim() || "",
          email: profile?.email?.trim() || "",
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 빠진 항목이 있으면 그 항목만 비우고 대화로 되돌린다 (일반 약정과 같은 방식) */
  const backToChat = (keys, message) => {
    setLegacy((l) => {
      const next = { ...l.values };
      keys.forEach((k) => delete next[k]);
      return { values: next, messages: [...l.messages, { role: "assistant", content: message }] };
    });
    navigate(`/donate/legacy/${programId}/chat`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await api.createAgreement({
        programId,
        values,
        signer,
        schemaVersion: form.schema_version,
        fields: form.fields,
        donationType: "legacy", // 유산기부 신청서 서식으로 검증·발행된다
      });
      setAgreement({ ...res, signerEmail: signer.email, signerName: signer.name });
      // 등록 id와 문서 id를 유산기부 레코드에 붙여둔다
      // (완료 화면에서 서명 상태와 서명된 약정서를 함께 보여주기 위해)
      await api.updateLegacyPledge(legacy.pledgeId, {
        agreementId: res.agreementId,
        documentId: res.documentId,
      });
      setLegacy({ agreementId: res.agreementId, documentId: res.documentId });
      navigate(`/legacy/${legacy.pledgeId}/witness`);
    } catch (err) {
      if (err.code === "MISSING") {
        backToChat(
          (err.data?.missing || []).map((m) => m.key),
          `${err.message} 다시 여쭤볼게요.`
        );
      } else if (err.code === "SCHEMA_CHANGED") {
        backToChat(
          err.data?.changedKeys || [],
          "기관에서 계약서 서식을 변경했어요. 바뀐 항목만 다시 확인할게요."
        );
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fields = form?.fields || [];
  const rows = toSummaryRows(fields, values);
  const missing = rows.filter((r) => r.required && r.text === null);

  return (
    <Layout title="기부 의사 등록" subtitle="대화에서 모은 내용으로 등록해요">
      <LegacySteps current={5} />
      {error && <div className="alert alert-danger">{error}</div>}

      <Card>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>
          지금 등록해두면 녹음을 나중에 마치더라도 기부 의사는 기관에 남습니다. 아래 주소로
          모두싸인 서명 요청 메일이 발송돼요.
        </p>
      </Card>

      {loading ? (
        <Card>
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        </Card>
      ) : missing.length > 0 ? (
        // 챗봇이 다 모았으면 여기 올 일이 없다. 그래도 비면 입력칸을 새로 만드는 대신
        // 대화로 돌려보낸다 — 같은 항목을 두 군데서 입력받지 않기 위해서다.
        <Card title="아직 비어 있는 항목이 있어요">
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.8 }}>
            {missing.map((m) => m.label).join(", ")} 항목이 비어 있어요. 대화로 돌아가면 큐빗이
            이어서 여쭤볼게요.
          </p>
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() =>
              backToChat(
                missing.map((m) => m.key),
                "약정서에 들어갈 항목 중 빠진 것이 있어 이어서 여쭤볼게요."
              )
            }
          >
            대화로 돌아가기
          </button>
        </Card>
      ) : (
        <form onSubmit={submit}>
          <Card title="약정서에 들어갈 내용" subtitle={`${form?.program_name || ""} · 대화에서 모은 내용이에요`}>
            <table className="info-table">
              <tbody>
                {rows
                  .filter((r) => r.text !== null)
                  .map((row) => (
                    <tr key={row.key}>
                      <th>{row.label}</th>
                      <td>{row.text}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {(form?.prefilled_labels || []).length > 0 && (
              <p className="hint">
                기관이 미리 정해둔 항목:{" "}
                {(form.prefilled_labels || []).map((p) => p.label || p.key).join(", ")}
              </p>
            )}

            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/donate/legacy/${programId}/chat`)}
            >
              고칠 내용이 있어요 (대화로 돌아가기)
            </button>
          </Card>

          <Card title="서명자 정보" subtitle="이 주소로 서명 요청 메일이 발송돼요">
            <div className="field">
              <label>서명자 이름</label>
              <input
                value={signer.name}
                onChange={(e) => setSigner((s) => ({ ...s, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>서명자 이메일</label>
              <input
                type="email"
                value={signer.email}
                onChange={(e) => setSigner((s) => ({ ...s, email: e.target.value }))}
                placeholder="서명 요청 링크를 받을 이메일"
                required
              />
            </div>
            <p className="hint">주소가 틀리면 서명 요청이 엉뚱한 곳으로 갑니다. 한 번 더 확인해주세요.</p>

            <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
              {submitting ? "등록 중..." : "기부 의사 등록하고 다음으로"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/donate/legacy/${programId}/script`)}
            >
              대본으로 돌아가기
            </button>
          </Card>
        </form>
      )}
    </Layout>
  );
}
