import type { AuthResponse } from "./types";

const storageKey = "coaching-auth-session";

export function getStoredSession() {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function storeSession(session: AuthResponse) {
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(storageKey);
}
