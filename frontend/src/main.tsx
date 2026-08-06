import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { BRANDING } from "./config/branding";

// styles.css defines --color-primary/-dark/-light as static defaults; override them
// here at runtime so per-client theme colors don't require a per-client CSS build.
document.documentElement.style.setProperty("--color-primary", BRANDING.primaryColor);
document.documentElement.style.setProperty("--color-primary-dark", BRANDING.primaryColorDark);
document.documentElement.style.setProperty("--color-primary-light", BRANDING.primaryColorLight);
// index.html's <title> is a static fallback (Vite's %VITE_X% substitution only works
// when the var is actually set at build time — brainwave has none set today) — set it
// here instead so BRANDING's own JS-level fallback applies consistently.
document.title = BRANDING.instituteName;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
