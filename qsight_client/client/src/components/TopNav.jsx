import { NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

const LINKS = [
  { to: "/home", label: "홈", icon: "home" },
  { to: "/programs", label: "탐색하기", icon: "explore" },
  { to: "/mypage", label: "마이페이지", icon: "person" },
  { to: "/documents", label: "나의 증서함", icon: "history_edu" },
];

/**
 * 상단 내비게이션 바.
 *
 * 기존 사이드바를 상단으로 올린 것 — 로그인 후 앱 전체 화면에서 항상 보이며,
 * 페이지 이동은 이 바 하나로 가능하다 (사용자가 매번 홈으로 돌아가지 않아도
 * 됨 → 자율적으로 탐색할 여지를 늘리는 목적도 겸함).
 */
export default function TopNav() {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();
  const name = profile?.name?.trim();

  return (
    <header className="topnav">
      <button className="topnav-logo" onClick={() => navigate("/home")}>
        Q<span>.</span>sight
      </button>
      <nav className="topnav-links">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
          >
            <Icon name={link.icon} size={18} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="topnav-user">
        {name ? (
          <>
            <div className="avatar">{name.slice(0, 1)}</div>
            <span>{name} 님</span>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => navigate("/profile")}>
            기본정보 입력
          </button>
        )}
      </div>
    </header>
  );
}
