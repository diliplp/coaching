import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { getStoredSession } from "../auth";

export function ProtectedRoute({ children, roles }: { children: ReactElement; roles?: string[] }) {
  const session = getStoredSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(session.user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
