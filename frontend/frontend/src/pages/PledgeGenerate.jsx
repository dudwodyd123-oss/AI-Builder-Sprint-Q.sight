import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import StepIndicator from "../components/StepIndicator.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

export default function PledgeGenerate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setDocument } = usePledgeFlow();
  const [status, setStatus] = useState("loading"); // loading | done | error
  const [error, setError] = useState("");

  const run = () => {
    setStatus("loading");
    setError("");
    api
      .generateDocument(id)
      .then((res) => {
        setDocument(res.document);
        setStatus("done");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Layout title="약정서 자동 생성" subtitle="AI가 약속 내용을 바탕으로 약정서를 만들고 있어요">
      <StepIndicator current={1} />
      <Card>
        <div className="center-col" style={{ padding: "40px 0" }}>
          {status === "loading" && (
            <>
              <div className="spinner" />
              <p className="text-muted" style={{ marginTop: 18 }}>약정서를 생성하고 있어요. 잠시만 기다려주세요...</p>
            </>
          )}
          {status === "done" && (
            <>
              <div style={{ fontSize: 42, marginBottom: 12 }}>✅</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>약정서가 생성되었어요</h2>
              <p className="text-muted" style={{ fontSize: 14 }}>내용을 확인하고 필요하면 수정할 수 있어요.</p>
              <button className="btn btn-primary btn-lg" style={{ marginTop: 20 }} onClick={() => navigate(`/pledge/${id}/review`)}>
                약정서 확인하러 가기
              </button>
            </>
          )}
          {status === "error" && (
            <>
              <div className="alert alert-danger" style={{ maxWidth: 480 }}>{error}</div>
              <button className="btn btn-secondary" onClick={run}>
                다시 시도하기
              </button>
            </>
          )}
        </div>
      </Card>
    </Layout>
  );
}
