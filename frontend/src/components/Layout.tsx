import type { AuthUser } from "../types";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getStoredSession } from "../auth";

const navItems = [
  { to: "/", label: "Dashboard", roles: ["super_admin", "teacher", "student"], icon: "🏠" },
  { to: "/question-bank", label: "Question Bank", roles: ["super_admin", "teacher"], icon: "📚" },
  { to: "/exam-builder", label: "Exam Builder", roles: ["super_admin", "teacher"], icon: "🛠️" },
  { to: "/subject-books", label: "Subject Books", roles: ["super_admin", "teacher"], icon: "📖" },
  { to: "/analytics", label: "Analytics", roles: ["super_admin", "teacher"], icon: "📊" },
  { to: "/exams", label: "Manage Exams", roles: ["super_admin", "teacher"], icon: "📝" },
  { to: "/curriculum", label: "Curriculum", roles: ["super_admin", "teacher"], icon: "🗓️" },
  { to: "/live-exam", label: "Live Exam", roles: ["super_admin", "teacher", "student"], icon: "⚡" },
  { to: "/admin", label: "Admin Settings", roles: ["super_admin"], icon: "⚙️" }
];

export function Layout() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [isCollapsed, setIsCollapsed] = useState(false);
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
        <div>
          <p className="eyebrow">Coaching SaaS</p>
          <h1>{isCollapsed ? "CS" : "Exam Portal"}</h1>
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
