import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { isComplete } from "../profile.js";

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();

  // 기본정보가 없으면 먼저 입력받는다 (로그인 대체)
  const start = () => navigate(isComplete(profile) ? "/home" : "/profile?next=/home");

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="hero-inner">
          <div>
            <span className="landing-eyebrow">마음을 잇는 기부</span>
            <h1 className="landing-title">
              서류 대신,
              <br />
              <span className="underline-wrap">
                <em>이야기</em>로 시작하는
                <svg viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M2 9 C 50 2, 150 2, 198 9" stroke="#E07856" strokeWidth="4" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              <br />
              기부 약정
            </h1>
            <p className="landing-sub">
              복잡한 양식과 낯선 용어 대신, 편안한 대화로 시작하세요.
              <br />
              당신의 마음이 정확한 약정서가 되고, 서명까지 자연스럽게 이어집니다.
            </p>
            <button className="btn btn-primary landing-cta" onClick={start}>
              시작하기
            </button>
          </div>
          <div className="hero-visual">
            <div className="mini-quote mini-quote-2">
              <p>"딸 이름으로 작은 장학금을 만들고 싶어요."</p>
              <span>— 익명의 기부자</span>
            </div>
            <div className="mini-quote mini-quote-1">
              <p>"매달 커피 한 잔 값이면 충분하대요."</p>
              <span>— 또 다른 기부자</span>
            </div>
            <div className="letter-card">
              <div className="coin-badge">
                매달
                <br />
                따뜻함
              </div>
              <p className="letter-quote">
                "김민준이고, 010-1234-5678이에요.
                <br />
                매달 3만원씩, 1년간 함께할게요."
              </p>
              <p className="letter-sign">— 어느 기부자의 첫 마디</p>
              <div className="sticky-note">
                3초 만에
                <br />
                약정 항목 인식 <Icon name="check" size={13} />
              </div>
            </div>
          </div>
        </div>
        <div className="scroll-hint">
          <span>SCROLL</span>
          <div className="line" />
        </div>
      </div>

      <section className="section-block">
        <div className="section-inner">
          <span className="section-label">기존 방식과의 차이</span>
          <h2 className="section-title">
            기부는 원래
            <br />
            이렇게 딱딱하지 않았습니다
          </h2>
          <p className="section-desc">
            종이 서식과 전화 상담은 마음을 담기엔 너무 차갑습니다. Q.sight는 대화로, 그 온도를 그대로 옮깁니다.
          </p>
          <div className="story-grid">
            <div className="story-old">
              <div className="story-old-title">이전에는</div>
              <p className="strike">기관마다 다른 PDF 양식 다운로드</p>
              <p className="strike">항목 뜻을 몰라도 혼자 채워 넣기</p>
              <p className="strike">전화로 다시 확인, 우편으로 서명</p>
            </div>
            <div className="story-new">
              <div className="story-new-title">Q.sight에서는</div>
              <div className="mini-bubble">매달 3만원씩 1년간 낼게요</div>
              <div className="mini-bubble reply">이름과 연락처만 알려주시면 바로 정리해드릴게요 :)</div>
              <div className="mini-bubble">김민준, 010-1234-5678</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block section-alt">
        <div className="section-inner">
          <span className="section-label">Q.sight가 하는 일</span>
          <h2 className="section-title">
            기술은 뒤로,
            <br />
            사람의 마음이 앞으로
          </h2>
          <p className="section-desc">
            우리는 AI에게 "말에서 값을 찾는 일"만 맡깁니다. 무엇을 묻고, 어떻게 안내할지는 모두 사람이 정한 원칙을 따릅니다.
          </p>
          <div className="feature-row">
            <div className="feature-num">01</div>
            <div>
              <h3>
                편안한 대화, 정확한 기록<span className="feature-tag">AI 상담</span>
              </h3>
              <p>애매한 말은 지어내지 않고 다시 여쭤봅니다. 확실한 것만 기록하니 안심할 수 있습니다.</p>
            </div>
          </div>
          <div className="feature-row">
            <div className="feature-num">02</div>
            <div>
              <h3>
                기관 서식이 바뀌면, 질문도 함께<span className="feature-tag">자동 약정서</span>
              </h3>
              <p>딱딱한 계약서 항목이 자연스러운 질문으로 바뀝니다.</p>
            </div>
          </div>
          <div className="feature-row">
            <div className="feature-num">03</div>
            <div>
              <h3>
                마지막 한 걸음까지 함께<span className="feature-tag">전자서명</span>
              </h3>
              <p>내용을 다시 정리해 보여드리고, 서명 요청까지 이어집니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="final-section">
        <div className="section-inner">
          <span className="section-label">지금, 시작해보세요</span>
          <h2 className="section-title">
            당신의 마음도,
            <br />
            누군가에게 닿을 수 있습니다
          </h2>
          <p className="section-desc">3분이면 충분합니다. 대화로 시작해서, 서명까지 — Q.sight가 함께 걷겠습니다.</p>
          <button className="final-cta-btn" onClick={start}>
            시작하기
          </button>
        </div>
      </section>

      <div className="footer-mini">Q · sight — 마음을 잇는 기부 · AI Builder Sprint 2026</div>
    </div>
  );
}
