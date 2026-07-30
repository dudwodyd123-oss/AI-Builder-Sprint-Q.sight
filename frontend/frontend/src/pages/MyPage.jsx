import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { api } from "../api.js";
import { TYPE_LABEL } from "../context/PledgeContext.jsx";

const STATUS_LABEL = {
  draft: "작성중",
  document_generated: "약정서 생성됨",
  signing: "서명 진행중",
  completed: "완료",
};

export default function MyPage() {
  const [pledges, setPledges] = useState([]);

  useEffect(() => {
    api
      .listPledges()
      .then((res) => setPledges(res.pledges || []))
      .catch(() => {});
  }, []);

  return (
    <Layout title="마이페이지" subtitle="내 정보와 기부 활동을 확인해보세요">
      <Card title="내 정보">
        <div className="field">
          <label>이름</label>
          <input defaultValue="문경민" readOnly />
        </div>
        <div className="field">
          <label>이메일</label>
          <input defaultValue="mgyeongmin07@gmail.com" readOnly />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>연락처</label>
          <input defaultValue="010-0000-0000" readOnly />
        </div>
      </Card>

      <Card title="나의 기부 활동" subtitle="지금까지 진행한 약속들이에요">
        {pledges.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>아직 진행한 약속이 없어요.</p>
        ) : (
          <div className="doc-list">
            {pledges.map((p) => (
              <div className="doc-row" key={p.id}>
                <div>
                  <div className="title">{TYPE_LABEL[p.type] || p.type}</div>
                  <div className="meta">{p.target || "-"} · {p.amount || "-"}</div>
                </div>
                <span className={`badge ${p.status === "completed" ? "badge-success" : "badge-pending"}`}>
                  {STATUS_LABEL[p.status] || p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
}
