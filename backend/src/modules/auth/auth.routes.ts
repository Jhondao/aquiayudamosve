import { Router } from "express";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { validateBody } from "../../middleware/validate";
import { logSecurityEvent } from "../security/securityEvents";
import { loginSchema, registerSchema } from "./auth.schemas";
import { getPublicProfile, loginUser, registerUser, revokeRefreshToken, rotateRefreshToken } from "./auth.service";

const REFRESH_COOKIE = "aquiayudamosve_refresh";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax" as const,
  path: "/api/auth",
};

router.post("/register", authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const { accessToken, refreshToken, userId } = await registerUser(email, password, displayName, req);
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: env.jwtRefreshTtlDays * 86400 * 1000 });
    await logSecurityEvent(req, "register", userId);
    res.status(201).json({ accessToken, profile: await getPublicProfile(userId) });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    try {
      const { accessToken, refreshToken, userId } = await loginUser(email, password, req);
      res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: env.jwtRefreshTtlDays * 86400 * 1000 });
      await logSecurityEvent(req, "login_success", userId);
      res.json({ accessToken, profile: await getPublicProfile(userId) });
    } catch (err) {
      await logSecurityEvent(req, "login_failure", undefined, { email });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: "Sesión inválida. Inicia sesión de nuevo." });
    const { accessToken, refreshToken, userId } = await rotateRefreshToken(token, req);
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: env.jwtRefreshTtlDays * 86400 * 1000 });
    res.json({ accessToken, profile: await getPublicProfile(userId) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    await logSecurityEvent(req, "logout", req.user?.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    res.json({ profile: await getPublicProfile(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
