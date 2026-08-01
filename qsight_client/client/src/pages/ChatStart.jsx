import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

export default function ChatStart() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { program, form, setForm } = usePledgeFlow();
  const [loading, setLoading] = useState(!form);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);

  // 대화 시작 시점의 스키마를 기억해둔다. 약정 생성 직전에 다시 조회해 비교한다.
  useEffect(() => {
    if (form?.program_id === programId) {
      setLoading(false);
      return;
    }
    api
      .getContractForm(programId)
      .then((res) => setForm(res.form))
      .catch((err) => {
        if (err.code === "PROGRAM_ARCHIVED") setArchived(true);
        setError(err.message);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const programName = form?.program_name || program?.name || "모금 사업";
  const requiredCount = (form?.fields || []).filter((f) => f.required).length;

  if (loading) {
    return (
      <Layout title="AI 상담 시작">
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="AI 상담 시작" subtitle={`${programName} 후원을 도와드릴게요`}>
      {error && <div className="alert alert-danger">{error}</div>}

      <Card>
        <div className="center-col" style={{ padding: "20px 0" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              marginBottom: 18,
            }}
          >
            🤖
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>안녕하세요, AI 상담사 큐빗이에요</h2>

          {archived ? (
            <>
              <div className="alert alert-info" style={{ maxWidth: 440, marginTop: 12 }}>
                이 사업은 모금이 종료되어 더 이상 약정을 진행할 수 없어요. 진행 중인 다른 사업을 선택해주세요.
              </div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate("/programs")}>
                다른 사업 보기
              </button>
            </>
          ) : form?.ready === false ? (
            <>
              <div className="alert alert-info" style={{ maxWidth: 440, marginTop: 12 }}>
                {form.note || "이 사업은 아직 계약서 서식이 준비되지 않아 약정을 진행할 수 없어요."}
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate("/programs")}>
                다른 사업 보기
              </button>
            </>
          ) : (
            <>
              <p className="text-muted" style={{ maxWidth: 440, lineHeight: 1.7, fontSize: 14.5 }}>
                <strong>{programName}</strong> 약정에 필요한 {requiredCount}가지 항목을 대화로 편하게 여쭤볼게요.
                모두 확인되면 서명 요청 메일을 보내드려요.
              </p>
              <button
                className="btn btn-primary btn-lg"
                style={{ marginTop: 22 }}
                onClick={() => navigate(`/programs/${programId}/chat`)}
                disabled={!form}
              >
                대화 시작하기
              </button>
            </>
          )}
        </div>
      </Card>
    </Layout>
  );
}
