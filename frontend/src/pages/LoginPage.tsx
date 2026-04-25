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
        <p className="eyebrow">Secure Access</p>
        <h1>Coaching Exam Portal</h1>
        <p>{status}</p>

        <div className="preset-row">
          {presets.map((preset) => (
            <button
              key={preset.email}
              type="button"
              className="secondary-button"
              onClick={() => {
                setEmail(preset.email);
                setPassword(preset.password);
              }}
            >
              {preset.label}
            </button>
          ))}
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
