import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";

/**
 * [6] 증인 등록 + 결격 확인.
 *
 * 결격 문항은 legacy-spec.json에서 온다. 셋 다 "예"여야 진행할 수 있고,
 * 하나라도 아니면 여기서 막는다 (서버도 PATCH에서 같은 검사를 한 번 더 한다).
 */
export default function LegacyWitness() {
  const { pledgeId } = useParams();
  const navigate = useNavigate();
  const { spec, error: specError } = useLegacySpec();
  const { legacy, setLegacy } = usePledgeFlow();

  const [name, setName] = useState(legacy.witness?.name || "");
  const [contact, setContact] = useState(legacy.witness?.contact || "");
  const [answers, setAnswers] = useState(legacy.witness?.eligibility || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 새로고침으로 들어온 경우 서버에서 진행 상태를 복원한다
  useEffect(() => {
    if (legacy.pledgeId === pledgeId) return;
    api
      .getLegacyPledge(pledgeId)
      .then((res) => setLegacy({ pledgeId: res.pledge.id, values: res.pledge.values, script: res.script }))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pledgeId]);

  const questions = spec?.witness_eligibility?.questions || [];
  const answered = questions.filter((q) => answers[q.key] !== undefined);
  const blocked = questions.some((q) => answers[q.key] === false);
  const ready = name.trim() && questions.length > 0 && questions.every((q) => answers[q.key] === true);

  const answer = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.updateLegacyPledge(pledgeId, {
        witness: { name: name.trim(), contact: contact.trim(), eligibility: answers },
      });
      setLegacy({ witness: res.pledge.witness, script: res.script });
      navigate(`/legacy/${pledgeId}/record`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="증인 등록" subtitle="녹음할 때 함께 있어 줄 증인 한 분이 필요해요">
      <LegacySteps current={6} />
      {(error || specError) && <div className="alert alert-danger">{error || specError}</div>}

      <Card title="증인 정보">
        <div className="field">
          <label>증인 성명</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="녹음에서 말할 이름 그대로" />
          <p className="hint">이 이름이 대본의 마지막 문장에 들어갑니다.</p>
        </div>
        <div className="field">
          <label>증인 연락처 (선택)</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="010-0000-0000" />
        </div>
      </Card>

      <Card title="증인 자격 확인" subtitle={spec?.notices?.witness}>
        <div className="consent-list">
          {questions.map((q) => (
            <div key={q.key} className={`witness-row${answers[q.key] === false ? " bad" : ""}`}>
              <span className="witness-q">{q.text}</span>
              <div className="gap-12">
                <button
                  className={`btn ${answers[q.key] === true ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => answer(q.key, true)}
                >
                  예
                </button>
                <button
                  className={`btn ${answers[q.key] === false ? "btn-secondary" : "btn-ghost"}`}
                  onClick={() => answer(q.key, false)}
                >
                  아니오
                </button>
              </div>
            </div>
          ))}
        </div>

        {blocked ? (
          <div className="alert alert-danger" style={{ marginTop: 18 }}>
            {spec?.witness_eligibility?.blocked_notice}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 14 }}>
            {answered.length} / {questions.length} 확인함 · 세 항목 모두 "예"여야 진행할 수 있어요.
          </p>
        )}

        <button
          className="btn btn-primary btn-block btn-lg"
          style={{ marginTop: 10 }}
          disabled={!ready || busy || blocked}
          onClick={submit}
        >
          {blocked ? "다른 분을 증인으로 모셔주세요" : busy ? "저장 중..." : "증인 등록하고 녹음 준비"}
        </button>
      </Card>
    </Layout>
  );
}
