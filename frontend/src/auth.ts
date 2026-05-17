import type { AuthResponse } from "./types";

const storageKey = "coaching-auth-session";

export function getStoredSession() {
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function storeSession(session: AuthResponse) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearSession() {
  window.sessionStorage.removeItem(storageKey);
}
