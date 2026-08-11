import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/tokens";

export type AuthedUser = { id: string; role: "citizen" | "moderator" | "admin" };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Reads the access token from the Authorization header. Never trusts client-supplied user ids. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length));
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // Invalid/expired token: leave req.user unset, let requireAuth reject downstream.
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Autenticación requerida." });
  next();
}

export function requireRole(...roles: AuthedUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Autenticación requerida." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permisos para esta acción." });
    }
    next();
  };
}
