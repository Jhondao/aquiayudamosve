import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { coarsenCoordinates, haversineMeters } from "../../utils/geo";
import { applyDecay, determineTrustLevel, recomputeReportTrustScore, trustLevelCopy } from "../trust/trustScore.service";
import { rewardUsefulConfirmation } from "../trust/reputation.service";
import { SENSITIVE_CATEGORY_KEYS, needStatusLabels, type NeedStatusValue } from "./reports.schemas";
import { broadcastPush } from "../../lib/push";

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
    departmentName: report.departmentName,
    municipalityName: report.municipalityName,
    localityName: report.localityName,
    locationSource: report.locationSource,
    approxLocationText: report.approxLocationText,
    lat: report.lat,
    lng: report.lng,
    isSensitive: report.isSensitive,
    // Fase 1 del PROMPT MAESTRO — solo no-null cuando category.group es
    // "necesidad". quantityPending se calcula al leer, no se persiste
    // (mismo patrón que applyDecay más abajo).
    needStatus: report.needStatus,
    needStatusLabel: report.needStatus ? needStatusLabels[report.needStatus as NeedStatusValue] : null,
    quantityNeeded: report.quantityNeeded,
    quantityUnit: report.quantityUnit,
    quantityReceived: report.quantityReceived,
    quantityPending: report.quantityNeeded != null ? Math.max(0, report.quantityNeeded - report.quantityReceived) : null,
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

/**
 * Publishing without a session is allowed (community-first: no signup wall
 * to ask for help or report). We still need a stable identity to attach the
 * report to for the trust/reputation system, so an email+phone pair either
 * reuses or creates a passwordless "guest" User. If the email already
 * belongs to a real account, we refuse — otherwise anyone could post under
 * someone else's identity just by typing their email.
 */
async function resolveGuestContact(email: string, phone: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isGuest) {
      throw new HttpError(409, "Ese correo ya tiene una cuenta. Inicia sesión para publicar con ella.");
    }
    if (existing.phone !== phone) {
      await prisma.user.update({ where: { id: existing.id }, data: { phone } });
    }
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email,
      phone,
      isGuest: true,
      displayName: email.split("@")[0],
      reputation: { create: { score: 0, level: "nuevo" } },
    },
  });
  return created.id;
}

export async function createReport(
  actor: { userId?: string; email?: string; phone?: string },
  input: {
    categoryKey: string;
    title: string;
    description: string;
    departmentName: string;
    municipalityName: string;
    localityName?: string;
    locationSource: "gps" | "catalog" | "manual";
    approxLocationText?: string;
    lat: number;
    lng: number;
    quantityNeeded?: number;
    quantityUnit?: string;
  }
) {
  let userId = actor.userId;
  if (!userId) {
    if (!actor.email || !actor.phone) {
      throw new HttpError(400, "Agrega tu correo y celular para publicar sin cuenta.");
    }
    userId = await resolveGuestContact(actor.email, actor.phone);
  }

  const category = await prisma.reportCategory.findUnique({ where: { key: input.categoryKey } });
  if (!category || !category.active) throw new HttpError(400, "Categoría inválida.");

  const isSensitive = SENSITIVE_CATEGORY_KEYS.has(input.categoryKey);
  const coords = isSensitive ? coarsenCoordinates(input.lat, input.lng) : { lat: input.lat, lng: input.lng };
  const isNecesidad = category.group === "necesidad";

  const report = await prisma.report.create({
    data: {
      categoryId: category.id,
      title: input.title,
      description: input.description,
      departmentName: input.departmentName,
      municipalityName: input.municipalityName,
      localityName: input.localityName ?? null,
      locationSource: input.locationSource,
      approxLocationText: isSensitive ? "Ubicación aproximada (precisión reducida)" : (input.approxLocationText ?? null),
      lat: coords.lat,
      lng: coords.lng,
      isSensitive,
      createdById: userId,
      trustScore: 20,
      lastConfirmedAt: new Date(),
      needStatus: isNecesidad ? "necesitamos" : null,
      quantityNeeded: isNecesidad ? input.quantityNeeded ?? null : null,
      quantityUnit: isNecesidad ? input.quantityUnit ?? null : null,
    },
    ...reportWithRelations,
  });

  await prisma.auditLog.create({
    data: { actorId: userId, action: "report.create", entityType: "report", entityId: report.id },
  });

  const PUSH_GROUPS: Record<string, string> = { critico: "⚠️", necesidad: "🆘" };
  if (PUSH_GROUPS[category.group]) {
    // No bloquea la respuesta al usuario — el envío de push no debe
    // demorar ni tumbar la publicación del reporte si falla.
    broadcastPush({
      title: `${PUSH_GROUPS[category.group]} ${category.label}`,
      body: report.title,
      url: `/reporte/${report.id}`,
    }).catch(() => {});
  }

  return serializeReport(report);
}

export async function listReports(filters: {
  departmentName?: string;
  municipalityName?: string;
  group?: string;
  institutional?: boolean;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.ReportWhereInput = {
    deletedAt: null,
    status: { in: ["active", "inactive"] }, // hidden reports never surface publicly
    ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
    ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
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

export async function findNearbyReports(params: { lat: number; lng: number; radiusMeters: number; categoryKey?: string }) {
  // Bounding-box antes del Haversine — sin esto, un `take` ciego a escala
  // nacional puede devolver 0 resultados aunque sí existan reportes cercanos
  // reales, si esas filas no caen dentro del slice pre-filtro. Aproximación
  // simple sobre lat/lng (usa el índice @@index([lat,lng]) ya existente),
  // no un índice espacial real — suficiente para esta fase.
  const latDelta = params.radiusMeters / 111_320;
  const lngDelta = params.radiusMeters / (111_320 * Math.cos((params.lat * Math.PI) / 180));

  const candidates = await prisma.report.findMany({
    where: {
      deletedAt: null,
      status: "active",
      lat: { gte: params.lat - latDelta, lte: params.lat + latDelta },
      lng: { gte: params.lng - lngDelta, lte: params.lng + lngDelta },
      ...(params.categoryKey ? { category: { key: params.categoryKey } } : {}),
    },
    ...reportWithRelations,
    take: 500,
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

/**
 * Fase 1 del PROMPT MAESTRO. Abierta a cualquier usuario logueado, no solo
 * al creador — mismo modelo comunitario que confirm/flag/update ya usan
 * (reclamar un punto es una fase posterior, sección 22 del documento).
 * También toca lastConfirmedAt: si no lo hiciera, un punto que la comunidad
 * sí mantiene activamente decaería igual que uno abandonado, reintroduciendo
 * por otra puerta el problema que esta fase busca resolver.
 */
export async function updateNeedStatus(
  reportId: string,
  userId: string,
  input: { needStatus?: NeedStatusValue; quantityReceived?: number }
) {
  if (input.needStatus === undefined && input.quantityReceived === undefined) {
    throw new HttpError(400, "Indica un estado o una cantidad recibida.");
  }
  const report = await loadReport(reportId);
  if (report.category.group !== "necesidad") {
    throw new HttpError(400, "Este reporte no es una necesidad.");
  }

  const parts: string[] = [];
  if (input.needStatus) parts.push(`Estado actualizado a "${needStatusLabels[input.needStatus]}".`);
  if (input.quantityReceived !== undefined) {
    const unit = report.quantityUnit ?? "";
    const needed = report.quantityNeeded != null ? ` de ${report.quantityNeeded}${unit}` : "";
    parts.push(`Recibidos ${input.quantityReceived}${unit}${needed}.`);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: {
      ...(input.needStatus ? { needStatus: input.needStatus } : {}),
      ...(input.quantityReceived !== undefined ? { quantityReceived: input.quantityReceived } : {}),
      lastConfirmedAt: new Date(),
    },
  });
  await prisma.reportUpdate.create({ data: { reportId, userId, text: parts.join(" "), deactivates: false } });

  return getReport(reportId);
}

export async function addEvidence(reportId: string, userId: string, input: { imageUrl?: string; sourceUrl?: string; relatedOrgName?: string }) {
  await loadReport(reportId);
  await prisma.reportEvidence.create({ data: { reportId, userId, ...input } });
  await recomputeReportTrustScore(reportId);
  return getReport(reportId);
}
