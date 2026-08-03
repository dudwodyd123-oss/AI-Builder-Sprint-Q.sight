import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { isComplete } from "../profile.js";
import { loadLegacyIds, legacyStage, activePledges } from "../legacyLocal.js";
import { loadHeritageIds } from "../heritageLocal.js";
import { loadHometownIds } from "../hometownLocal.js";
import { loadChatHistoryIds } from "../chatHistoryLocal.js";
import { api } from "../api.js";

export default function MyPage() {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();
  const [legacyPledges, setLegacyPledges] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [heritagePledges, setHeritagePledges] = useState([]);
  const [hometownPledges, setHometownPledges] = useState([]);
  const [chatHistoryCount, setChatHistoryCount] = useState(0);

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

  // 문화유산 후원 신청도 같은 방식(로컬 저장 id)으로 조회한다
  useEffect(() => {
    const ids = loadHeritageIds();
    if (ids.length === 0) return;
    api
      .lookupHeritagePledges(ids)
      .then((res) => setHeritagePledges(res.pledges || []))
      .catch(() => {});
  }, []);

  // 고향사랑기부 신청도 같은 방식(로컬 저장 id)으로 조회한다
  useEffect(() => {
    const ids = loadHometownIds();
    if (ids.length === 0) return;
    api
      .lookupHometownPledges(ids)
      .then((res) => setHometownPledges(res.pledges || []))
      .catch(() => {});
  }, []);

  // 기부 현황 요약 카드는 증서함과 같은 출처(개인 모두싸인 계정)에서 가져온다
  useEffect(() => {
    api
      .listDocuments()
      .then((res) => setDocuments(res.documents || []))
      .catch(() => {});
  }, []);

  // AI 상담 대화 기록 개수 — 목록 전체는 /chat-history 페이지에서 본다
  useEffect(() => {
    const ids = loadChatHistoryIds();
    if (ids.length === 0) return;
    api
      .lookupChatHistory(ids)
      .then((res) => setChatHistoryCount((res.conversations || []).length))
      .catch(() => {});
  }, []);

  const signedCount = documents.filter((d) => d.signed).length;
  const pendingLegacyCount = legacyPledges.filter((p) => legacyStage(p).to !== "done").length;
  const pendingCount =
    documents.filter((d) => !d.signed).length + pendingLegacyCount + heritagePledges.length + hometownPledges.length;
  const programNames = new Set([
    ...documents.map((d) => d.title).filter(Boolean),
    ...legacyPledges.map((p) => p.programName).filter(Boolean),
    ...heritagePledges.map((p) => p.target).filter(Boolean),
    ...hometownPledges.map((p) => p.target).filter(Boolean),
  ]);

  return (
    <Layout title="마이페이지" subtitle="내 정보와 기부 활동을 확인해보세요">
      {(documents.length > 0 || legacyPledges.length > 0 || heritagePledges.length > 0 || hometownPledges.length > 0) && (
        <div style={{ position: "relative", marginBottom: 4 }}>
          <span className="postit-clip" aria-hidden="true">
            <Icon name="attach_file" size={26} />
          </span>
          <Card className="postit-note" title={`${profile?.name ? `${profile.name} 님의 ` : ""}기부 현황`}>
            <div className="postit-stats">
              <div className="postit-stat">
                <span className="postit-stat-num">{pendingCount}</span>
                <span className="postit-stat-label">진행중인 약정</span>
              </div>
              <div className="postit-stat">
                <span className="postit-stat-num">{signedCount}</span>
                <span className="postit-stat-label">발급된 영수증</span>
              </div>
              <div className="postit-stat">
                <span className="postit-stat-num">{programNames.size}</span>
                <span className="postit-stat-label">함께한 모금 사업</span>
              </div>
            </div>
          </Card>
        </div>
      )}

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

      {heritagePledges.length > 0 && (
        <Card title="문화유산 후원 신청" subtitle="이 브라우저에서 접수한 신청이에요">
          <div className="doc-list">
            {heritagePledges.map((p) => (
              <div className="doc-row" key={p.id}>
                <div>
                  <div className="title">{p.target || "문화유산 후원"}</div>
                  <div className="meta">
                    {new Date(p.createdAt).toLocaleDateString("ko-KR")} 신청
                    {p.amount ? ` · ${Number(p.amount).toLocaleString()}원` : ""}
                    {p.period && ` · ${p.period}`}
                  </div>
                </div>
                <span className="badge badge-pending">{p.status || "접수됨"}</span>
              </div>
            ))}
          </div>
          <p className="hint">담당자가 확인 후 별도로 연락드려요.</p>
        </Card>
      )}

      {hometownPledges.length > 0 && (
        <Card title="고향사랑기부 신청" subtitle="이 브라우저에서 접수한 신청이에요">
          <div className="doc-list">
            {hometownPledges.map((p) => (
              <div className="doc-row" key={p.id}>
                <div>
                  <div className="title">{p.target || "고향사랑기부"}</div>
                  <div className="meta">
                    {new Date(p.createdAt).toLocaleDateString("ko-KR")} 신청
                    {p.amount ? ` · ${Number(p.amount).toLocaleString()}원` : ""}
                  </div>
                </div>
                <span className="badge badge-pending">{p.status || "접수됨"}</span>
              </div>
            ))}
          </div>
          <p className="hint">담당자가 확인 후 별도로 연락드려요.</p>
        </Card>
      )}

      {chatHistoryCount > 0 && (
        <Card title="AI 대화 기록" subtitle="AI 상담사와 나눈 대화를 다시 볼 수 있어요">
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
            지금까지 저장된 상담 대화가 {chatHistoryCount}건 있어요.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate("/chat-history")}>
            대화 기록 보기
          </button>
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
