import TopNav from "./TopNav.jsx";

export default function Layout({ title, subtitle, wide = false, actions = null, children }) {
  return (
    <div className="app-shell">
      <TopNav />
      <div className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          {actions && <div className="topbar-user">{actions}</div>}
        </header>
        <div className={`page-content${wide ? " wide" : ""}`}>{children}</div>
      </div>
    </div>
  );
}
