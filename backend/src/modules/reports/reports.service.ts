import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { coarsenCoordinates, haversineMeters } from "../../utils/geo";
import { applyDecay, determineTrustLevel, recomputeReportTrustScore, trustLevelCopy } from "../trust/trustScore.service";
import { rewardUsefulConfirmation } from "../trust/reputation.service";
import { SENSITIVE_CATEGORY_KEYS } from "./reports.schemas";

const reportWithRelations = Prisma.validator<Prisma.ReportDefaultArgs>()({
  include: {
    category: true,
    organization: true,
    confirmations: true,
    evidence: true,
    flags: { where: { resolved: false } },
    updates: { orderBy: { createdAt: "asc" } },
  },
});
type ReportWithRelations = Prisma.ReportGetPayload<typeof reportWithRelations>;

export function serializeReport(report: ReportWithRelations) {
  const isOrgBacked = Boolean(report.organizationId);
  const displayScore = applyDecay(report.trustScore, report.lastConfirmedAt);
  const incorrectCount =
    report.flags.length + report.confirmations.filter((c) => c.type === "incorrect").length;
  const level = determineTrustLevel({
    score: displayScore,
    lastConfirmedAt: report.lastConfirmedAt,
    isOrgBacked,
    incorrectCount,
  });
  const confirmCount = report.confirmations.filter((c) => c.type === "confirm").length;

  return {
    id: report.id,
    title: report.title,
    description: report.description,
    city: report.city,
    approxLocationText: report.approxLocationText,
    lat: report.lat,
    lng: report.lng,
    isSensitive: report.isSensitive,
    status: report.status,
    category: {
      key: report.category.key,
      label: report.category.label,
      group: report.category.group,
    },
    organization: report.organization
      ? { name: report.organization.name, verified: report.organization.verified }
      : null,
    trustScore: displayScore,
    trustLevel: level,
    trustLevelLabel: trustLevelCopy[level].label,
    trustLevelDescription: trustLevelCopy[level].description,
    confirmationsCount: confirmCount,
    createdAt: report.createdAt,
    lastConfirmedAt: report.lastConfirmedAt,
    createdById: report.createdById,
    // Shown to viewers, never as proof by itself (section 7/34) — the trust
    // score already weighs evidence in; the UI must not re-imply certainty.
    evidence: report.evidence.map((e) => ({
      id: e.id,
      imageUrl: e.imageUrl,
      sourceUrl: e.sourceUrl,
      relatedOrgName: e.relatedOrgName,
      createdAt: e.createdAt,
    })),
    timeline: [
      { at: report.createdAt, text: "Publicado" },
      ...report.updates.map((u) => ({ at: u.createdAt, text: u.text })),
    ],
  };
}

async function loadReport(id: string) {
  const report = await prisma.report.findUnique({ where: { id }, ...reportWithRelations });
  if (!report || report.deletedAt) throw new HttpError(404, "Reporte no encontrado.");
  return report;
}

export async function createReport(
  userId: string,
  input: { categoryKey: string; title: string; description: string; city: string; approxLocationText: string; lat: number; lng: number }
) {
  const category = await prisma.reportCategory.findUnique({ where: { key: input.categoryKey } });
  if (!category || !category.active) throw new HttpError(400, "Categoría inválida.");

  const isSensitive = SENSITIVE_CATEGORY_KEYS.has(input.categoryKey);
  const coords = isSensitive ? coarsenCoordinates(input.lat, input.lng) : { lat: input.lat, lng: input.lng };

  const report = await prisma.report.create({
    data: {
      categoryId: category.id,
      title: input.title,
      description: input.description,
      city: input.city,
      approxLocationText: isSensitive ? "Ubicación aproximada (precisión reducida)" : input.approxLocationText,
      lat: coords.lat,
      lng: coords.lng,
      isSensitive,
      createdById: userId,
      trustScore: 20,
      lastConfirmedAt: new Date(),
    },
    ...reportWithRelations,
  });

  await prisma.auditLog.create({
    data: { actorId: userId, action: "report.create", entityType: "report", entityId: report.id },
  });

  return serializeReport(report);
}

export async function listReports(filters: { city?: string; group?: string; institutional?: boolean; page: number; pageSize: number }) {
  const where: Prisma.ReportWhereInput = {
    deletedAt: null,
    status: { in: ["active", "inactive"] }, // hidden reports never surface publicly
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.group ? { category: { group: filters.group as never } } : {}),
    ...(filters.institutional ? { organizationId: { not: null } } : {}),
  };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      ...reportWithRelations,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.report.count({ where }),
  ]);

  return { reports: reports.map(serializeReport), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getReport(id: string) {
  return serializeReport(await loadReport(id));
}

export async function findNearbyReports(params: { lat: number; lng: number; city: string; radiusMeters: number; categoryKey?: string }) {
  const candidates = await prisma.report.findMany({
    where: {
      deletedAt: null,
      status: "active",
      city: params.city,
      ...(params.categoryKey ? { category: { key: params.categoryKey } } : {}),
    },
    ...reportWithRelations,
    take: 200,
  });

  return candidates
    .filter((r) => haversineMeters(params.lat, params.lng, r.lat, r.lng) <= params.radiusMeters)
    .map(serializeReport);
}

export async function confirmReport(reportId: string, userId: string, type: "confirm" | "unsure" | "incorrect") {
  const report = await loadReport(reportId);

  try {
    await prisma.reportConfirmation.create({ data: { reportId, userId, type } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Ya registraste este tipo de confirmación para este reporte.");
    }
    throw err;
  }

  if (type === "confirm") {
    await prisma.report.update({ where: { id: reportId }, data: { lastConfirmedAt: new Date() } });
    await rewardUsefulConfirmation(userId, report.createdById);
  }

  await recomputeReportTrustScore(reportId);
  return getReport(reportId);
}

export async function flagReport(reportId: string, userId: string, reason: string) {
  await loadReport(reportId);
  await prisma.reportFlag.create({ data: { reportId, userId, reason } });
  await recomputeReportTrustScore(reportId);
  return getReport(reportId);
}

export async function addReportUpdate(reportId: string, userId: string, text: string, deactivates?: boolean) {
  await loadReport(reportId);
  await prisma.reportUpdate.create({ data: { reportId, userId, text, deactivates: Boolean(deactivates) } });
  if (deactivates) {
    await prisma.report.update({ where: { id: reportId }, data: { status: "inactive" } });
  }
  return getReport(reportId);
}

export async function addEvidence(reportId: string, userId: string, input: { imageUrl?: string; sourceUrl?: string; relatedOrgName?: string }) {
  await loadReport(reportId);
  await prisma.reportEvidence.create({ data: { reportId, userId, ...input } });
  await recomputeReportTrustScore(reportId);
  return getReport(reportId);
}
