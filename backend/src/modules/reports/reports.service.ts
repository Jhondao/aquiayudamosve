import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { coarsenCoordinates, haversineMeters } from "../../utils/geo";
import { applyDecay, determineTrustLevel, recomputeReportTrustScore, trustLevelCopy } from "../trust/trustScore.service";
import { rewardUsefulConfirmation } from "../trust/reputation.service";
import { SENSITIVE_CATEGORY_KEYS, needStatusLabels, type NeedStatusValue, type CommitmentStatusValue } from "./reports.schemas";
import { broadcastPush } from "../../lib/push";
import { resolveGuestContact, syntheticEmailForPhone } from "../../lib/guestIdentity";

const reportWithRelations = Prisma.validator<Prisma.ReportDefaultArgs>()({
  include: {
    category: true,
    organization: true,
    confirmations: true,
    evidence: true,
    flags: { where: { resolved: false } },
    updates: { orderBy: { createdAt: "asc" } },
    needCommitments: { orderBy: { createdAt: "desc" } },
  },
});
type ReportWithRelations = Prisma.ReportGetPayload<typeof reportWithRelations>;

// viewerId es opcional (reportes se leen sin sesión) y solo se usa para
// calcular `mine` por compromiso — nunca se expone el userId real de quien
// lo creó (ver needCommitments abajo).
export function serializeReport(report: ReportWithRelations, viewerId?: string) {
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
    // PROMPT MAESTRO v3, Fase A — ledger de promesas de ayuda. Nunca el
    // userId real (la UI dice "un colaborador"); `mine` es lo mínimo para
    // que el dueño de un compromiso vea sus propios controles.
    needCommitments: report.needCommitments.map((c) => ({
      id: c.id,
      quantity: c.quantity,
      unit: c.unit,
      status: c.status,
      estimatedArrival: c.estimatedArrival,
      transportMethod: c.transportMethod,
      note: c.note,
      createdAt: c.createdAt,
      mine: viewerId != null && c.userId === viewerId,
    })),
  };
}

async function loadReport(id: string) {
  const report = await prisma.report.findUnique({ where: { id }, ...reportWithRelations });
  if (!report || report.deletedAt) throw new HttpError(404, "Reporte no encontrado.");
  return report;
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

  return { reports: reports.map((r) => serializeReport(r)), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getReport(id: string, viewerId?: string) {
  return serializeReport(await loadReport(id), viewerId);
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
    .map((r) => serializeReport(r));
}

/**
 * Confirmar/dudoso/incorrecto no requiere cuenta — mismo criterio
 * "comunitario, sin barrera" que ya aplica a publicar (ver
 * resolveGuestContact arriba). Sin `actor.userId`, hace falta correo **o**
 * celular (no ambos — a diferencia de publicar) más nombre; el guard vive
 * aquí, no en el schema, mismo motivo que el resto de los .optional() de
 * este archivo. Sin correo, se resuelve con syntheticEmailForPhone.
 */
export async function confirmReport(
  reportId: string,
  actor: { userId?: string; email?: string; phone?: string; displayName?: string },
  type: "confirm" | "unsure" | "incorrect"
) {
  let userId = actor.userId;
  if (!userId) {
    if (!actor.email && !actor.phone) {
      throw new HttpError(400, "Agrega tu nombre y tu correo o celular para confirmar sin cuenta.");
    }
    const email = actor.email ?? syntheticEmailForPhone(actor.phone!);
    userId = await resolveGuestContact(email, actor.phone, actor.displayName);
  }

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
  return getReport(reportId, userId);
}

export async function flagReport(reportId: string, userId: string, reason: string) {
  await loadReport(reportId);
  await prisma.reportFlag.create({ data: { reportId, userId, reason } });
  await recomputeReportTrustScore(reportId);
  return getReport(reportId, userId);
}

export async function addReportUpdate(reportId: string, userId: string, text: string, deactivates?: boolean) {
  await loadReport(reportId);
  await prisma.reportUpdate.create({ data: { reportId, userId, text, deactivates: Boolean(deactivates) } });
  if (deactivates) {
    await prisma.report.update({ where: { id: reportId }, data: { status: "inactive" } });
  }
  return getReport(reportId, userId);
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

  return getReport(reportId, userId);
}

export async function addEvidence(reportId: string, userId: string, input: { imageUrl?: string; sourceUrl?: string; relatedOrgName?: string }) {
  await loadReport(reportId);
  await prisma.reportEvidence.create({ data: { reportId, userId, ...input } });
  await recomputeReportTrustScore(reportId);
  return getReport(reportId, userId);
}

/**
 * Un compromiso "en camino" sube el reporte de necesitamos → en_camino,
 * pero nunca pisa una señal más fuerte (parcialmente_cubierto/cubierto/
 * excedente) — mismo criterio de "nunca retroceder el estado" que ya usa
 * updateNeedStatus. Un compromiso "committed" (solo prometido, no en camino
 * todavía) no toca needStatus en absoluto.
 */
async function maybeBumpToEnCamino(reportId: string) {
  const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  if (report.needStatus === "necesitamos") {
    await prisma.report.update({
      where: { id: reportId },
      data: { needStatus: "en_camino", lastConfirmedAt: new Date() },
    });
  }
}

/**
 * PROMPT MAESTRO v3, Fase A. Mismo modelo comunitario que confirm/flag/
 * update/need-status (requireAuth, no restringido al creador). Nunca toca
 * quantityReceived — eso sigue siendo exclusivo de updateNeedStatus; un
 * compromiso es una promesa, no una entrega confirmada (sección 5 del
 * documento: "nunca sumar automáticamente algo comprometido como recibido").
 */
export async function createCommitment(
  reportId: string,
  userId: string,
  input: {
    quantity: number;
    unit?: string;
    status?: "committed" | "on_the_way";
    estimatedArrival?: Date;
    transportMethod?: string;
    note?: string;
  }
) {
  const report = await loadReport(reportId);
  if (report.category.group !== "necesidad") {
    throw new HttpError(400, "Este reporte no es una necesidad.");
  }
  await prisma.needCommitment.create({
    data: {
      reportId,
      userId,
      quantity: input.quantity,
      unit: input.unit,
      status: input.status ?? "committed",
      estimatedArrival: input.estimatedArrival,
      transportMethod: input.transportMethod,
      note: input.note,
    },
  });
  if (input.status === "on_the_way") await maybeBumpToEnCamino(reportId);
  return getReport(reportId, userId);
}

/**
 * Único endpoint del módulo con ownership check — un compromiso es una
 * promesa personal, no una acción comunitaria abierta como el resto.
 */
export async function updateCommitment(
  reportId: string,
  commitmentId: string,
  userId: string,
  input: { status?: CommitmentStatusValue; estimatedArrival?: Date; note?: string }
) {
  if (input.status === undefined && input.estimatedArrival === undefined && input.note === undefined) {
    throw new HttpError(400, "Indica qué quieres actualizar.");
  }
  const commitment = await prisma.needCommitment.findUnique({ where: { id: commitmentId } });
  if (!commitment || commitment.reportId !== reportId) {
    throw new HttpError(404, "Compromiso no encontrado.");
  }
  if (commitment.userId !== userId) {
    throw new HttpError(403, "Solo quien creó este compromiso puede actualizarlo.");
  }
  await prisma.needCommitment.update({
    where: { id: commitmentId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.estimatedArrival !== undefined ? { estimatedArrival: input.estimatedArrival } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  if (input.status === "on_the_way") await maybeBumpToEnCamino(reportId);
  return getReport(reportId, userId);
}
