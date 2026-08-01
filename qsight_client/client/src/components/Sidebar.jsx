import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/home", label: "홈", icon: "🏠" },
  { to: "/mypage", label: "마이페이지", icon: "👤" },
  { to: "/documents", label: "나의 증서함", icon: "📜" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Q<span>.</span>sight
      </div>
      <nav className="sidebar-nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <span>{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">Q.sight &copy; 2026<br />마음을 잇는 기부 플랫폼</div>
    </aside>
  );
}
