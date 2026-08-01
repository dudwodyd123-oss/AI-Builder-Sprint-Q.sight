import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { isComplete } from "../profile.js";
import { loadLegacyIds, legacyStage, activePledges } from "../legacyLocal.js";
import { api } from "../api.js";

export default function MyPage() {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();
  const [legacyPledges, setLegacyPledges] = useState([]);

  // 로그인이 없으므로 브라우저가 들고 있는 id로만 조회한다
  useEffect(() => {
    const ids = loadLegacyIds();
    if (ids.length === 0) return;
    api
      .lookupLegacyPledges(ids)
      // 다시 녹음해서 대체된 등록은 빼고 보여준다 (같은 건이 두 번 보이지 않게)
      .then((res) => setLegacyPledges(activePledges(res.pledges || [])))
      .catch(() => {});
  }, []);

  return (
    <Layout title="마이페이지" subtitle="내 정보와 기부 활동을 확인해보세요">
      <Card title="내 정보" subtitle="약정서에 들어갈 기본정보예요">
        {isComplete(profile) ? (
          <>
            <table className="info-table">
              <tbody>
                <tr>
                  <th>이름</th>
                  <td>{profile.name}</td>
                </tr>
                <tr>
                  <th>이메일</th>
                  <td>{profile.email}</td>
                </tr>
                <tr>
                  <th>전화번호</th>
                  <td>{profile.phone}</td>
                </tr>
              </tbody>
            </table>
            <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate("/profile")}>
              정보 수정하기
            </button>
          </>
        ) : (
          <>
            <p className="text-muted" style={{ fontSize: 14 }}>
              아직 기본정보를 입력하지 않았어요. 입력해두면 AI 상담사가 같은 항목을 다시 묻지 않아요.
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/profile")}>
              기본정보 입력하기
            </button>
          </>
        )}
      </Card>

      {legacyPledges.length > 0 && (
        <Card title="유산기부 (녹음유언)" subtitle="이 브라우저에서 진행한 등록이에요">
          <div className="doc-list">
            {legacyPledges.map((p) => {
              const stage = legacyStage(p);
              return (
                <div className="doc-row" key={p.id}>
                  <div>
                    <div className="title">{p.programName || "유산기부"}</div>
                    <div className="meta">
                      {new Date(p.createdAt).toLocaleDateString("ko-KR")} 시작
                      {p.witness?.name && ` · 증인 ${p.witness.name}`}
                    </div>
                  </div>
                  <div className="gap-12" style={{ alignItems: "center" }}>
                    <span className={`badge ${stage.cls}`}>{stage.label}</span>
                    <button
                      className="btn btn-ghost"
                      onClick={() => navigate(`/legacy/${p.id}/${stage.to}`)}
                    >
                      이어서 보기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="hint">
            녹음 파일은 기관에 보내지 않고 이 서비스에만 보관됩니다.
          </p>
        </Card>
      )}

      <Card title="나의 기부 활동" subtitle="약정 내역은 증서함에서 확인할 수 있어요">
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
          약정 원본은 기관(기업용 서버)에서 관리되고, 서명이 완료된 약정서는 내 모두싸인 계정에서 불러와요.
        </p>
        <button className="btn btn-secondary" onClick={() => navigate("/documents")}>
          나의 증서함으로
        </button>
      </Card>
    </Layout>
  );
}
