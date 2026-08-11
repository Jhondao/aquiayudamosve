import { ReputationLevel } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";

/**
 * TrustScoreService — first, transparent version of the algorithm from
 * PROMPT MAESTRO section 33. Deliberately simple and explainable, isolated
 * behind this module so the formula can change without touching callers.
 *
 * Two-part model:
 *  - `report.trustScore` stores the "event score": everything driven by
 *    confirmations, evidence and flags (section 33's + and - terms).
 *  - Time decay (section 11 — caducidad) is applied on READ, not stored,
 *    so a report that nobody touches keeps losing score every hour without
 *    needing a cron job to stay accurate.
 */

export type TrustLevel =
  | "sin_verificar"
  | "en_proceso"
  | "confirmado"
  | "institucional"
  | "desactualizada"
  | "cuestionada";

const TRUSTED_LEVELS: ReputationLevel[] = [
  "colaborador_confiable",
  "voluntario_verificado",
  "organizacion",
  "entidad_institucional",
];
const ORG_LEVELS: ReputationLevel[] = ["organizacion", "entidad_institucional"];

const BASE_SCORE_ON_CREATE = 20;
const CONFIRM_NORMAL = 5;
const CONFIRM_TRUSTED = 10;
const CONFIRM_ORG = 25;
const EVIDENCE_BONUS = 10;
const THREE_INDEPENDENT_BONUS = 15;
const INCORRECT_BY_TRUSTED_PENALTY = 10;
const CONTRADICTION_PENALTY = 25;
const CONTRADICTION_THRESHOLD = 3; // independent "incorrect" flags treated as a confirmed contradiction
const DECAY_POINTS_PER_HOUR = 2;

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Recomputes the event-driven part of the score from current DB state and persists it. */
export async function recomputeReportTrustScore(reportId: string): Promise<number> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      confirmations: { include: { user: { include: { reputation: true } } } },
      evidence: true,
      flags: true,
    },
  });

  let score = BASE_SCORE_ON_CREATE;

  // A user can never inflate their own report's score.
  const confirmations = report.confirmations.filter(
    (c) => c.userId !== report.createdById && c.type === "confirm"
  );

  for (const c of confirmations) {
    const level = c.user.reputation?.level ?? "nuevo";
    if (ORG_LEVELS.includes(level)) score += CONFIRM_ORG;
    else if (TRUSTED_LEVELS.includes(level)) score += CONFIRM_TRUSTED;
    else score += CONFIRM_NORMAL;
  }

  if (confirmations.length >= 3) score += THREE_INDEPENDENT_BONUS;
  if (report.evidence.length > 0) score += EVIDENCE_BONUS;

  const incorrectFlags = report.flags.filter((f) => !f.resolved);
  const incorrectByTrusted = report.confirmations.filter(
    (c) => c.type === "incorrect" && TRUSTED_LEVELS.includes(c.user.reputation?.level ?? "nuevo")
  );
  score -= incorrectByTrusted.length * INCORRECT_BY_TRUSTED_PENALTY;

  const incorrectCount =
    incorrectFlags.length + report.confirmations.filter((c) => c.type === "incorrect").length;
  if (incorrectCount >= CONTRADICTION_THRESHOLD) score -= CONTRADICTION_PENALTY;

  const finalScore = clamp(score);
  await prisma.report.update({ where: { id: reportId }, data: { trustScore: finalScore } });
  return finalScore;
}

export function applyDecay(baseScore: number, lastConfirmedAt: Date, staleHoursThreshold = env.staleHoursThreshold): number {
  const hoursSince = (Date.now() - lastConfirmedAt.getTime()) / 3_600_000;
  if (hoursSince <= staleHoursThreshold) return clamp(baseScore);
  const overdueHours = hoursSince - staleHoursThreshold;
  return clamp(baseScore - overdueHours * DECAY_POINTS_PER_HOUR);
}

export function determineTrustLevel(params: {
  score: number;
  lastConfirmedAt: Date;
  isOrgBacked: boolean;
  incorrectCount: number;
  staleHoursThreshold?: number;
}): TrustLevel {
  const { score, lastConfirmedAt, isOrgBacked, incorrectCount } = params;
  const staleHours = params.staleHoursThreshold ?? env.staleHoursThreshold;
  const hoursSince = (Date.now() - lastConfirmedAt.getTime()) / 3_600_000;

  if (incorrectCount >= CONTRADICTION_THRESHOLD) return "cuestionada";
  if (hoursSince > staleHours * 3) return "desactualizada"; // well past stale — decay alone already tanks the score
  if (isOrgBacked) return "institucional";
  if (score >= 70) return "confirmado";
  if (score >= 40) return "en_proceso";
  return "sin_verificar";
}

export const trustLevelCopy: Record<TrustLevel, { label: string; description: string }> = {
  sin_verificar: {
    label: "Sin verificar",
    description: "Reporte recién creado. Todavía no hay suficientes evidencias o confirmaciones.",
  },
  en_proceso: {
    label: "En proceso de verificación",
    description: "Existen algunas confirmaciones independientes, pero todavía no son suficientes.",
  },
  confirmado: {
    label: "Confirmado por la comunidad",
    description: "El reporte recibió confirmaciones confiables y evidencia consistente.",
  },
  institucional: {
    label: "Fuente institucional",
    description: "Publicado o confirmado por una organización previamente validada en la plataforma.",
  },
  desactualizada: {
    label: "Información desactualizada",
    description: "Fue válido anteriormente, pero no ha recibido confirmaciones recientes.",
  },
  cuestionada: {
    label: "Información cuestionada",
    description: "Usuarios o moderadores detectaron información posiblemente falsa o contradictoria.",
  },
};
