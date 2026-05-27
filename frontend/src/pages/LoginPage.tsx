import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { storeSession } from "../auth";

const presets = [
  { label: "Admin", email: "admin@coaching.local", password: "admin123" },
  { label: "Teacher", email: "teacher@coaching.local", password: "teacher123" },
  { label: "Student", email: "student@coaching.local", password: "student123" }
];

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(presets[0].email);
  const [password, setPassword] = useState(presets[0].password);
  const [status, setStatus] = useState("Use one of the seeded demo accounts to continue.");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Signing in...");

    try {
      const session = await apiClient.login({ email, password });
      storeSession(session);
      navigate("/", { replace: true });
    } catch (error) {
      console.error(error);
      setStatus("Unable to sign in. Check credentials or backend connection.");
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px", textAlign: "center" }}>
          <img src="/logo.jpeg" alt="Logo" style={{ width: "120px", height: "120px", borderRadius: "50%", objectFit: "cover", marginBottom: "16px", border: "2.5px solid var(--color-primary-light)", boxShadow: "0 6px 16px rgba(0,0,0,0.08)" }} />
          <p className="eyebrow" style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "1px" }}>Brainwave Science Academy</p>
          <h1 style={{ marginTop: "8px", fontSize: "2rem", fontWeight: "700", letterSpacing: "-0.5px" }}>Exam Portal</h1>
        </div>
        <p style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--color-text-muted)", marginBottom: "20px" }}>{status}</p>

        <div style={{ marginBottom: "20px" }}>
          <label className="field">
            <span>Quick Login Role (Demo)</span>
            <select
              onChange={(e) => {
                const preset = presets.find(p => p.email === e.target.value);
                if (preset) {
                  setEmail(preset.email);
                  setPassword(preset.password);
                }
              }}
              value={email}
              style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
            >
              {presets.map(preset => (
                <option key={preset.email} value={preset.email}>{preset.label} Account</option>
              ))}
            </select>
          </label>
        </div>

        <form className="book-form" onSubmit={(event) => void handleLogin(event)}>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Login</button>
        </form>
      </div>
    </div>
  );
}
