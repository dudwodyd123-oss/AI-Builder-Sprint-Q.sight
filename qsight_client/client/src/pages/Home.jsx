import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

export default function Home() {
  const navigate = useNavigate();
  const { setProgram } = usePledgeFlow();
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    api
      .listPrograms()
      .then((res) => setPrograms(res.programs || []))
      .catch(() => {});
  }, []);

  const start = (program) => {
    if (!program.contract_ready) return;
    setProgram(program);
    navigate(`/programs/${program.id}/start`);
  };

  return (
    <Layout title="메인 홈" subtitle="오늘도 좋은 마음을 나눠보세요">
      <div className="home-hero-grid">
        <button className="card home-hero hero-warm" onClick={() => navigate("/donate/type?entry=pledge")}>
          <span className="home-hero-blob" aria-hidden="true" />
          <span className="home-hero-icon"><Icon name="favorite" size={24} /></span>
          <span className="home-hero-body">
            <h2 className="home-hero-title">새로운 약속<br />시작하기</h2>
            <p className="home-hero-desc">이미 정해둔 기부가 있다면 바로 약정을 시작해보세요.</p>
          </span>
          <span className="home-hero-cta">시작하기 <Icon name="arrow_forward" size={16} /></span>
        </button>

        <button className="card home-hero hero-cool" onClick={() => navigate("/donate/type?entry=find")}>
          <span className="home-hero-blob" aria-hidden="true" />
          <span className="home-hero-icon"><Icon name="travel_explore" size={24} /></span>
          <span className="home-hero-body">
            <h2 className="home-hero-title">나에게 맞는<br />기부처 찾아보기</h2>
            <p className="home-hero-desc">아직 고민 중이라면 AI가 맞는 기부처를 찾아드려요.</p>
          </span>
          <span className="home-hero-cta">찾아보기 <Icon name="arrow_forward" size={16} /></span>
        </button>
      </div>

      <Card title="진행중인 모금 사업" subtitle="지금 후원할 수 있는 사업이에요">
        {programs.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>
            불러올 수 있는 모금 사업이 없어요. 기업용 서버가 실행 중인지 확인해주세요.
          </p>
        ) : (
          <div className="doc-list">
            {programs.slice(0, 3).map((p) => (
              <div className="doc-row" key={p.id}>
                <div>
                  <div className="title">{p.name}</div>
                  <div className="meta">{(p.tags || []).slice(0, 3).join(" · ")}</div>
                </div>
                {p.contract_ready ? (
                  <button className="btn btn-ghost" onClick={() => start(p)}>
                    약정 시작하기
                  </button>
                ) : (
                  <div className="wax-seal wax-amber" title="준비 중">
                    <span className="txt">
                      준비
                      <br />중
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => navigate("/programs")}>
          전체 사업 보기
        </button>
      </Card>

      <Card title="이런 방법도 있어요" subtitle="꼭 정해진 순서대로 하지 않아도 돼요 — 마음 가는 대로 둘러보세요">
        <div className="explore-grid">
          <button className="explore-card" onClick={() => navigate("/donate/hometown")}>
            <div className="explore-card-top">
              <span className="explore-card-icon"><Icon name="cottage" size={18} /></span>
            </div>
            <div className="explore-card-title">고향사랑기부</div>
            <p className="explore-card-desc">답례품도 받고 세액공제도 받아요.</p>
          </button>
          <button className="explore-card" onClick={() => navigate("/donate/heritage")}>
            <div className="explore-card-top">
              <span className="explore-card-icon"><Icon name="temple_buddhist" size={18} /></span>
            </div>
            <div className="explore-card-title">문화유산 후원</div>
            <p className="explore-card-desc">우리 문화유산을 지키는 일에 함께해요.</p>
          </button>
          <button className="explore-card" onClick={() => navigate("/donate/legacy")}>
            <div className="explore-card-top">
              <span className="explore-card-icon"><Icon name="history_edu" size={18} /></span>
            </div>
            <div className="explore-card-title">유산기부</div>
            <p className="explore-card-desc">목소리로 남기는 나눔의 약속이에요.</p>
          </button>
          <button className="explore-card" onClick={() => navigate("/donate/type?entry=find")}>
            <div className="explore-card-top">
              <span className="explore-card-icon"><Icon name="smart_toy" size={18} /></span>
            </div>
            <div className="explore-card-title">AI 추천 받기</div>
            <p className="explore-card-desc">대화로 나에게 맞는 기부처를 찾아드려요.</p>
          </button>
        </div>
      </Card>
    </Layout>
  );
}
