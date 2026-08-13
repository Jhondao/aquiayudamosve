import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

// Umbral recomendado por Google para reCAPTCHA Enterprise (0.0 = bot, 1.0 =
// humano). No se expone como env var configurable — mantenerlo simple.
const MIN_SCORE = 0.5;

/**
 * Verifica un token de reCAPTCHA Enterprise contra la API de Assessments.
 * Falla ABIERTO (permite la acción) si RECAPTCHA_PROJECT_ID/API_KEY no están
 * configurados, o si la llamada a Google falla por un problema de red/API —
 * este es un sitio de emergencia, no debe bloquear a alguien real por un
 * problema transitorio de un servicio de terceros. Falla CERRADO solo cuando
 * Google responde con evidencia real de bot (token inválido o score bajo).
 */
export async function verifyRecaptcha(token: string, expectedAction: string): Promise<boolean> {
  if (!env.recaptchaProjectId || !env.recaptchaApiKey) return true;

  try {
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${env.recaptchaProjectId}/assessments?key=${env.recaptchaApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: { token, expectedAction } }),
    });
    if (!res.ok) {
      console.error("reCAPTCHA assessment request failed:", res.status);
      return true;
    }
    const data = (await res.json()) as {
      tokenProperties?: { valid?: boolean };
      riskAnalysis?: { score?: number };
    };
    if (!data.tokenProperties?.valid) return false;
    return (data.riskAnalysis?.score ?? 0) >= MIN_SCORE;
  } catch (err) {
    console.error("reCAPTCHA assessment error:", err);
    return true;
  }
}

/**
 * Solo exige el token cuando no hay sesión (req.user vacío) — un usuario
 * autenticado ya pasó por su propio filtro (registro/login). Un token
 * ausente no bloquea por sí solo (ver verifyRecaptcha) — solo un token
 * presente y marcado como inválido/bajo puntaje bloquea la acción.
 */
export function requireRecaptchaForGuests(expectedAction: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user) return next();
    const token = typeof req.body?.recaptchaToken === "string" ? req.body.recaptchaToken : undefined;
    if (!token) return next();
    const ok = await verifyRecaptcha(token, expectedAction);
    if (!ok) {
      return res.status(400).json({ error: "No pudimos verificar que eres una persona real. Intenta de nuevo." });
    }
    next();
  };
}
