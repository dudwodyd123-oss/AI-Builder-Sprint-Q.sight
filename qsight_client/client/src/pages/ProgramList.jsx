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

/** 프로그램이 가진 태그를 전부 모아 등장 빈도순으로 정렬한다 — 자주 쓰이는 태그가 앞에 오게. */
function collectTags(programs) {
  const counts = new Map();
  programs.forEach((p) => (p.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export default function ProgramList() {
  const navigate = useNavigate();
  const { setProgram } = usePledgeFlow();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);

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

  const tags = collectTags(programs);
  const q = query.trim().toLowerCase();
  const filtered = programs.filter((p) => {
    if (activeTag && !(p.tags || []).includes(activeTag)) return false;
    if (q && !`${p.name} ${p.description || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <Layout title="모금 사업 선택" subtitle="후원하고 싶은 사업을 골라주세요 — 순서 없이 자유롭게 둘러보세요" wide>
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && programs.length > 0 && (
        <>
          <div className="field" style={{ maxWidth: 360, marginBottom: 12 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사업 이름이나 키워드로 검색해보세요"
            />
          </div>
          {tags.length > 0 && (
            <div className="explore-filter-bar">
              <button
                type="button"
                className={`explore-filter-chip ${activeTag === null ? "active" : ""}`}
                onClick={() => setActiveTag(null)}
              >
                전체
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`explore-filter-chip ${activeTag === t ? "active" : ""}`}
                  onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="center-col" style={{ padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <p className="text-muted" style={{ fontSize: 14 }}>진행중인 모금 사업이 없어요.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-muted" style={{ fontSize: 14 }}>조건에 맞는 모금 사업이 없어요. 다른 검색어나 태그로 찾아보세요.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", alignItems: "stretch", gap: 16 }}>
          {filtered.map((p) => (
            <Card key={p.id} className="program-card">
              <div style={{ flex: 1 }}>
              <div className="flex-between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{p.name}</h3>
                {!p.contract_ready && (
                  <div className="wax-seal wax-amber" title="준비 중">
                    <span className="txt">
                      준비
                      <br />중
                    </span>
                  </div>
                )}
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
                    <button
                      key={t}
                      type="button"
                      className="badge badge-muted"
                      style={{ cursor: "pointer", border: "none", font: "inherit", fontWeight: 700, margin: 0 }}
                      onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                      title="이 태그로 필터링"
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              )}
              </div>

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
