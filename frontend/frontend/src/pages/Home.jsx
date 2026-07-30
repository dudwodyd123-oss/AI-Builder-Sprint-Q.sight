import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { TYPE_LABEL } from "../context/PledgeContext.jsx";

export default function Home() {
  const navigate = useNavigate();
  const [pledges, setPledges] = useState([]);

  useEffect(() => {
    api
      .listPledges()
      .then((res) => setPledges(res.pledges || []))
      .catch(() => {});
  }, []);

  const active = pledges.filter((p) => p.status !== "completed").length;
  const done = pledges.filter((p) => p.status === "completed").length;

  return (
    <Layout title="메인 홈" subtitle="오늘도 좋은 마음을 나눠보세요">
      <Card style={{ background: "linear-gradient(135deg, var(--navy), var(--navy-lighter))", color: "#fff", border: "none" }}>
        <h2 className="card-title" style={{ color: "#fff", fontSize: 20 }}>새로운 마음을 전해보세요</h2>
        <p className="card-sub" style={{ color: "rgba(255,255,255,0.7)" }}>
          정해둔 기부가 있다면 바로 약속을 시작하고, 아직 고민 중이라면 AI가 맞는 기부처를 찾아드려요.
        </p>
        <div className="gap-12" style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/donate/type?entry=pledge")}>
            새로운 약속 시작하기
          </button>
          <button
            className="btn btn-lg"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
            onClick={() => navigate("/donate/type?entry=find")}
          >
            나에게 맞는 기부처 찾아보기
          </button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 18 }}>
        <Card>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>진행중인 약속</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{active}건</div>
        </Card>
        <Card>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>완료된 약속</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{done}건</div>
        </Card>
        <Card>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>전체 약속</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{pledges.length}건</div>
        </Card>
      </div>

      <Card title="최근 약속" subtitle="가장 최근에 진행한 약속 내역이에요">
        {pledges.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>아직 진행한 약속이 없어요. 위에서 새로운 약속을 시작해보세요.</p>
        ) : (
          <div className="doc-list">
            {pledges
              .slice(-3)
              .reverse()
              .map((p) => (
                <div className="doc-row" key={p.id}>
                  <div>
                    <div className="title">{TYPE_LABEL[p.type] || p.type}</div>
                    <div className="meta">{p.target || "-"} · {p.amount || "-"}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => navigate("/documents")}>
                    자세히 보기
                  </button>
                </div>
              ))}
          </div>
        )}
      </Card>
    </Layout>
  );
}
