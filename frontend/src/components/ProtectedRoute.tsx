import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { getStoredSession } from "../auth";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const session = getStoredSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
