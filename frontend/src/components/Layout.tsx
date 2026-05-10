import type { AuthUser } from "../types";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getStoredSession } from "../auth";

const navItems = [
  { to: "/", label: "Dashboard", roles: ["super_admin", "teacher", "student"] },
  { to: "/question-bank", label: "Question Bank", roles: ["super_admin", "teacher", "student"] },
  { to: "/exam-builder", label: "Exam Builder", roles: ["super_admin", "teacher"] },
  { to: "/subject-books", label: "Subject Books", roles: ["super_admin", "teacher"] },
  { to: "/analytics", label: "Analytics", roles: ["super_admin", "teacher"] },
  { to: "/exams", label: "Manage Exams", roles: ["super_admin", "teacher"] },
  { to: "/curriculum", label: "Curriculum", roles: ["super_admin", "teacher"] },
  { to: "/live-exam", label: "Live Exam", roles: ["super_admin", "teacher", "student"] },
  { to: "/admin", label: "Admin Settings", roles: ["super_admin"] }
];

export function Layout() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const visibleNavItems = navItems.filter((item) => session && item.roles.includes(session.user.role as AuthUser["role"]));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Coaching SaaS</p>
          <h1>Exam Portal MVP</h1>
        </div>
        {session && (
          <div className="session-card">
            <strong>{session.user.name}</strong>
            <span>{session.user.role}</span>
            <span>{session.user.email}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                clearSession();
                navigate("/login", { replace: true });
              }}
            >
              Logout
            </button>
          </div>
        )}
        <nav className="nav-list">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
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
