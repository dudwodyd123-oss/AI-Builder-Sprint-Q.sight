import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { toSummaryRows } from "../format.js";

/** 서명자 이름 입력칸의 초기값 추천용. 값은 사용자가 직접 확인/수정한다. */
function guessSignerName(fields, values) {
  const field = fields.find((f) => f.type === "text" && /name|성명|이름/i.test(`${f.key} ${f.label}`));
  return field && typeof values[field.key] === "string" ? values[field.key] : "";
}

/**
 * 서명자 정보 입력 → ③ 약정 생성.
 *
 * values에 이름·연락처가 있어도 서명 요청 메일이 갈 주소는 여기서 따로 받는다.
 * 이메일이 틀리면 서명 요청이 엉뚱한 곳으로 가기 때문이다.
 */
export default function SignerInfo() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { form, values, setForm, setValues, setMessages, setSigner, setAgreement, profile } =
    usePledgeFlow();

  const fields = form?.fields || [];
  const [signerForm, setSignerForm] = useState({ name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!form || fields.length === 0) {
      navigate(`/programs/${programId}/chat`, { replace: true });
      return;
    }
    // 기본정보를 먼저 쓰고, 없으면 수집된 값에서 이름을 추정한다.
    // 이메일은 서명 요청이 갈 주소라 화면에서 반드시 눈으로 확인하게 둔다.
    setSignerForm((f) => ({
      name: f.name || profile?.name?.trim() || guessSignerName(fields, values),
      email: f.email || profile?.email?.trim() || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  /** 서식이 바뀌었거나 필수 항목이 빠졌을 때, 해당 항목만 비우고 대화로 되돌린다 */
  const backToChat = (keys, message) => {
    if (keys.length > 0) {
      const next = { ...values };
      keys.forEach((k) => delete next[k]);
      setValues(next);
    }
    setMessages((m) => [...m, { role: "assistant", content: message }]);
    navigate(`/programs/${programId}/chat`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await api.createAgreement({
        programId,
        values,
        signer: signerForm,
        schemaVersion: form.schema_version,
        fields,
      });
      setSigner(signerForm);
      setAgreement({ ...res, signerEmail: signerForm.email, signerName: signerForm.name });
      navigate(`/agreements/${res.agreementId}`);
    } catch (err) {
      if (err.code === "SCHEMA_CHANGED") {
        setForm({ ...form, fields: err.data.fields, schema_version: err.data.schemaVersion });
        backToChat(
          err.data?.changedKeys || [],
          "기관에서 계약서 서식을 변경했어요. 바뀐 항목만 다시 확인할게요."
        );
      } else if (err.code === "MISSING") {
        backToChat((err.data?.missing || []).map((m) => m.key), `${err.message} 다시 여쭤볼게요.`);
      } else if (err.code === "PROGRAM_ARCHIVED") {
        // 대화를 마친 뒤 기관이 사업을 보관한 경우 — 재질문이 아니라 여기서 끝낸다
        setError(`${err.message} 진행 중인 다른 사업을 선택해주세요.`);
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!form || fields.length === 0) return null;

  const rows = toSummaryRows(fields, values).filter((r) => r.text !== null);

  return (
    <Layout title="서명자 정보" subtitle="서명 요청 메일을 받을 주소를 알려주세요">
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title="서명자 정보" subtitle="이 주소로 모두싸인 서명 요청 메일이 발송돼요">
        <form onSubmit={submit}>
          <div className="field">
            <label>서명자 이름</label>
            <input
              value={signerForm.name}
              onChange={(e) => setSignerForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>서명자 이메일</label>
            <input
              type="email"
              value={signerForm.email}
              onChange={(e) => setSignerForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="서명 요청 링크를 받을 이메일"
              required
            />
          </div>
          <p className="hint">
            주소가 틀리면 서명 요청이 엉뚱한 곳으로 갑니다. 한 번 더 확인해주세요.
          </p>
          <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
            {submitting ? "발송중..." : "약정 확정하고 서명 요청 메일 받기"}
          </button>
        </form>
      </Card>

      <Card title="확정할 약정 내용">
        <table className="info-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="btn btn-ghost"
          style={{ marginTop: 14 }}
          onClick={() => navigate(`/programs/${programId}/confirm`)}
        >
          확인 화면으로 돌아가기
        </button>
      </Card>
    </Layout>
  );
}
