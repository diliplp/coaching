import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getStoredSession, storeSession, clearSession } from "../auth";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character (!@#$%...)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const passed = PASSWORD_RULES.filter(r => r.test(password)).length;
  const pct = (passed / PASSWORD_RULES.length) * 100;
  const color = passed <= 2 ? "#ef4444" : passed <= 3 ? "#f59e0b" : passed <= 4 ? "#3b82f6" : "#22c55e";
  const label = passed <= 2 ? "Weak" : passed <= 3 ? "Fair" : passed <= 4 ? "Good" : "Strong";
  return (
    <div style={{ marginTop: "6px" }}>
      <div style={{ height: "6px", background: "var(--color-border)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.3s, background 0.3s" }} />
      </div>
      <p style={{ fontSize: "0.75rem", color, margin: "4px 0 6px", fontWeight: "600" }}>{label}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        {PASSWORD_RULES.map(r => {
          const ok = r.test(password);
          return (
            <li key={r.label} style={{ fontSize: "0.75rem", color: ok ? "#22c55e" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "5px" }}>
              <span>{ok ? "✓" : "○"}</span> {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const session = getStoredSession();

  // Unauthenticated users have no business here
  if (!session) {
    navigate("/login", { replace: true });
    return null;
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "error" | "success"; message: string }>({
    type: "idle",
    message: session.user.mustChangePassword
      ? "For security, you must set a new password before continuing."
      : "Enter your current password and choose a new one."
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New passwords do not match." });
      return;
    }
    const failedRule = PASSWORD_RULES.find(r => !r.test(newPassword));
    if (failedRule) {
      setStatus({ type: "error", message: failedRule.label });
      return;
    }
    setIsSubmitting(true);
    setStatus({ type: "idle", message: "Changing password..." });
    try {
      const updated = await apiClient.changePassword({ currentPassword, newPassword });
      storeSession(updated);
      setStatus({ type: "success", message: "Password changed successfully. Redirecting..." });
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err: any) {
      setStatus({ type: "error", message: err?.message || "Failed to change password." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px", textAlign: "center" }}>
          <img
            src="/logo.jpeg"
            alt="Logo"
            style={{ width: "100px", height: "100px", borderRadius: "50%", objectFit: "contain", padding: "6px", background: "#fff", marginBottom: "16px", border: "2.5px solid var(--color-primary-light)", boxShadow: "0 7px 16px rgba(0,0,0,0.08)" }}
          />
          <p className="eyebrow" style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "1px" }}>Brainwave Science Academy</p>
          <h2 style={{ marginTop: "8px", fontWeight: "700" }}>Change Password</h2>
        </div>

        <p style={{
          textAlign: "center",
          fontSize: "0.9rem",
          marginBottom: "20px",
          color: status.type === "error" ? "#dc2626" : status.type === "success" ? "#16a34a" : "var(--color-text-muted)"
        }}>
          {status.message}
        </p>

        <form className="book-form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>Current Password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="8+ chars, upper, lower, number, special"
              required
            />
            <PasswordStrengthMeter password={newPassword} />
          </label>
          <label className="field">
            <span>Confirm New Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Changing…" : "Change Password"}
          </button>
          {!session.user.mustChangePassword && (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: "8px" }}
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
          )}
        </form>

        {session.user.mustChangePassword && (
          <p style={{ textAlign: "center", marginTop: "16px", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Logged in as <strong>{session.user.email}</strong> —{" "}
            <span
              style={{ cursor: "pointer", textDecoration: "underline" }}
              onClick={() => {
                apiClient.logout().catch(() => {});
                clearSession();
                navigate("/login", { replace: true });
              }}
            >
              Log out
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
