import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

function formatAmount(value) {
  if (typeof value !== "number") return "-";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만원`;
  return `${value.toLocaleString()}원`;
}

export default function ProgramList() {
  const navigate = useNavigate();
  const { setProgram } = usePledgeFlow();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listPrograms()
      .then((res) => setPrograms(res.programs || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const select = (program) => {
    if (!program.contract_ready) return;
    setProgram(program);
    navigate(`/programs/${program.id}/start`);
  };

  return (
    <Layout title="모금 사업 선택" subtitle="후원하고 싶은 사업을 골라주세요" wide>
      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <p className="text-muted" style={{ fontSize: 14 }}>진행중인 모금 사업이 없어요.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {programs.map((p) => (
            <Card key={p.id}>
              <div className="flex-between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{p.name}</h3>
                {!p.contract_ready && <span className="badge badge-muted">준비 중</span>}
              </div>
              <p className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.7, minHeight: 46 }}>
                {p.description}
              </p>

              <table className="info-table" style={{ marginTop: 4 }}>
                <tbody>
                  <tr>
                    <th>목표 금액</th>
                    <td>{formatAmount(p.goal_amount)}</td>
                  </tr>
                  <tr>
                    <th>모금 기간</th>
                    <td>{p.start_date} ~ {p.end_date}</td>
                  </tr>
                  <tr>
                    <th>참여 방법</th>
                    <td>{(p.methods || []).join(", ") || "-"}</td>
                  </tr>
                  {p.reward && (
                    <tr>
                      <th>답례품</th>
                      <td>{p.reward}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {(p.tags || []).length > 0 && (
                <div className="gap-12" style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {p.tags.map((t) => (
                    <span key={t} className="badge badge-muted">#{t}</span>
                  ))}
                </div>
              )}

              <button
                className={`btn btn-block ${p.contract_ready ? "btn-primary" : "btn-ghost"}`}
                style={{ marginTop: 16 }}
                onClick={() => select(p)}
                disabled={!p.contract_ready}
              >
                {p.contract_ready ? "이 사업 후원하기" : "계약서 준비 중이에요"}
              </button>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
