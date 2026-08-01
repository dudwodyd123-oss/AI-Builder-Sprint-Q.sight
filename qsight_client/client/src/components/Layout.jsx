import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";

export default function Layout({ title, subtitle, wide = false, actions = null, children }) {
  const navigate = useNavigate();
  const { profile } = usePledgeFlow();
  const name = profile?.name?.trim();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          <div className="topbar-user">
            {actions}
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
        <div className={`page-content${wide ? " wide" : ""}`}>{children}</div>
      </div>
    </div>
  );
}
