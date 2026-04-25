import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { findRecordByField } from "../data/database.js";
import type { AuthenticatedRequest, AuthTokenPayload, UserAccount, UserRole } from "../types.js";

const jwtSecret = process.env.JWT_SECRET ?? "coaching-saas-dev-secret";

export function signAuthToken(user: UserAccount) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      studentId: user.studentId ?? null
    } satisfies AuthTokenPayload,
    jwtSecret,
    { expiresIn: "7d" }
  );
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const token = header.replace("Bearer ", "");
    const payload = jwt.verify(token, jwtSecret) as AuthTokenPayload;
    (req as AuthenticatedRequest).auth = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth || !roles.includes(auth.role)) {
      res.status(403).json({ message: "You do not have access to this action" });
      return;
    }
    next();
  };
}

export async function findUserByEmail(email: string) {
  return findRecordByField<UserAccount>("users", "email", email);
}
