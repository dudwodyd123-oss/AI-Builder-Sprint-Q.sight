import Sidebar from "./Sidebar.jsx";

export default function Layout({ title, subtitle, wide = false, actions = null, children }) {
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
            <div className="avatar">문</div>
            <span>문경민 님</span>
          </div>
        </header>
        <div className={`page-content${wide ? " wide" : ""}`}>{children}</div>
      </div>
    </div>
  );
}
