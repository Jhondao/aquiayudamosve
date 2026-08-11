import { Prisma } from "@prisma/client";
import { Request } from "express";
import { prisma } from "../../lib/prisma";

export type SecurityEventType =
  | "login_success"
  | "login_failure"
  | "register"
  | "refresh_reuse_detected"
  | "logout"
  | "rate_limited"
  | "permission_denied";

/** Best-effort audit trail for security-relevant events — never throws into the request path. */
export async function logSecurityEvent(
  req: Request,
  type: SecurityEventType,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.securityEvent.create({
      data: {
        type,
        userId: userId ?? null,
        ip: req.ip ?? null,
        metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    console.error("[securityEvent] failed to persist", type, err);
  }
}
