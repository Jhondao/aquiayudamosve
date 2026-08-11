import { ReputationLevel } from "@prisma/client";
import { prisma } from "../../lib/prisma";

/**
 * Reputation (section 15): a quiet quality signal, never a competitive score.
 * Thresholds are intentionally coarse — this is not meant to feel like a game.
 */
const LEVEL_THRESHOLDS: [number, ReputationLevel][] = [
  [0, "nuevo"],
  [20, "colaborador"],
  [60, "colaborador_confiable"],
  [120, "voluntario_verificado"],
];

function levelForScore(score: number, currentLevel: ReputationLevel): ReputationLevel {
  // Organization-derived levels are set explicitly elsewhere (org verification), never by score climbing.
  if (currentLevel === "organizacion" || currentLevel === "entidad_institucional") return currentLevel;
  let level: ReputationLevel = "nuevo";
  for (const [threshold, lvl] of LEVEL_THRESHOLDS) {
    if (score >= threshold) level = lvl;
  }
  return level;
}

async function adjustReputation(userId: string, delta: number) {
  const rep = await prisma.userReputation.upsert({
    where: { userId },
    create: { userId, score: Math.max(0, delta), level: "nuevo" },
    update: {},
  });
  const newScore = Math.max(0, rep.score + delta);
  const newLevel = levelForScore(newScore, rep.level);
  await prisma.userReputation.update({
    where: { userId },
    data: { score: newScore, level: newLevel },
  });
}

/** A user's confirmation was a useful, independent verification. */
export async function rewardUsefulConfirmation(confirmerId: string, reportCreatorId: string) {
  if (confirmerId === reportCreatorId) return;
  await adjustReputation(confirmerId, 1);
  await adjustReputation(reportCreatorId, 2);
}

/** Moderator confirmed the report was false, spam, or manipulated (section 15 penalties). */
export async function penalizeForFalseInformation(userId: string) {
  await adjustReputation(userId, -15);
}

export async function penalizeForModerationSanction(userId: string) {
  await adjustReputation(userId, -10);
}
