import bcrypt from "bcryptjs";
import { Request } from "express";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
  signAccessToken,
} from "../../utils/tokens";

const BCRYPT_ROUNDS = 12;

export async function registerUser(email: string, password: string, displayName: string, req: Request) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Same generic message as "user not found" cases would use — never confirm which emails exist.
    throw new HttpError(409, "No se pudo crear la cuenta con esos datos.");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      reputation: { create: { score: 0, level: "nuevo" } },
    },
  });

  return issueSession(user.id, user.role, req);
}

export async function loginUser(email: string, password: string, req: Request) {
  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = () => new HttpError(401, "Correo o contraseña incorrectos.");

  if (!user || user.deletedAt) throw genericError();

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw genericError();

  return issueSession(user.id, user.role, req);
}

async function issueSession(userId: string, role: "citizen" | "moderator" | "admin", req: Request) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = generateRefreshToken();

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: req.headers["user-agent"]?.slice(0, 255),
      ip: req.ip,
      expiresAt: refreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken, userId };
}

/** Rotates the refresh token on every use; an unrecognized token revokes nothing but also grants nothing. */
export async function rotateRefreshToken(refreshToken: string, req: Request) {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  if (!session || session.user.deletedAt) {
    throw new HttpError(401, "Sesión inválida. Inicia sesión de nuevo.");
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

  return issueSession(session.userId, session.user.role, req);
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getPublicProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { reputation: true, organization: true },
  });
  if (!user) throw new HttpError(404, "Usuario no encontrado.");

  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    reputationLevel: user.reputation?.level ?? "nuevo",
    organization: user.organization ? { name: user.organization.name, verified: user.organization.verified } : null,
    createdAt: user.createdAt,
  };
}
