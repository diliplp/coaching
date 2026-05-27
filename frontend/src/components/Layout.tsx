import type { AuthUser } from "../types";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getStoredSession } from "../auth";

const navItems = [
  { to: "/", label: "Dashboard", roles: ["super_admin", "teacher", "student"], icon: "🏠" },
  { to: "/question-bank", label: "Question Bank", roles: ["super_admin", "teacher"], icon: "📚" },
  { to: "/exam-builder", label: "Exam Builder", roles: ["super_admin", "teacher"], icon: "🛠️" },
  { to: "/subject-books", label: "Subject Books", roles: ["super_admin"], icon: "📖" },
  { to: "/analytics", label: "Analytics", roles: ["super_admin", "teacher", "student"], icon: "📊" },
  { to: "/exams", label: "Manage Exams", roles: ["super_admin", "teacher"], icon: "📝" },
  { to: "/curriculum", label: "Curriculum", roles: ["super_admin", "teacher"], icon: "🗓️" },
  { to: "/offline-board-paper", label: "Offline Exam", roles: ["super_admin", "teacher"], icon: "🖨️" },
  { to: "/live-exam", label: "Live Exam", roles: ["super_admin", "teacher", "student"], icon: "⚡" },
  { to: "/admin", label: "Admin Settings", roles: ["super_admin"], icon: "⚙️" }
];

export function Layout() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [isCollapsed, setIsCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth <= 960);
  const visibleNavItems = navItems.filter((item) => session && item.roles.includes(session.user.role as AuthUser["role"]));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
        <button 
          className="sidebar-toggle" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "15px" }}>
          {isCollapsed ? (
            <img src="/logo.jpeg" alt="BSA Logo" style={{ width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img src="/logo.jpeg" alt="BSA Logo" style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--color-primary-light)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }} />
              <div>
                <p className="eyebrow" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.5px", lineHeight: "1.2" }}>Brainwave Science Academy</p>
                <h1 style={{ margin: "2px 0 0", fontSize: "1.25rem", fontWeight: "700", color: "var(--color-text)" }}>Exam Portal</h1>
              </div>
            </div>
          )}
        </div>
        {session && (
          <div className="session-card">
            <strong>{session.user.name}</strong>
            <span>{session.user.role}</span>
            <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{session.user.email}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                clearSession();
                navigate("/login", { replace: true });
              }}
            >
              {isCollapsed ? "🚪" : "Logout"}
            </button>
          </div>
        )}
        <nav className="nav-list">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              title={isCollapsed ? item.label : ""}
            >
              <span style={{ marginRight: isCollapsed ? 0 : "12px", fontSize: "1.2rem" }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
