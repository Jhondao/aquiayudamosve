import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { coarsenCoordinates, haversineMeters } from "../../utils/geo";
import { resolveGuestContact, syntheticEmailForPhone } from "../../lib/guestIdentity";
import { rewardUsefulConfirmation } from "../trust/reputation.service";
import { broadcastPush } from "../../lib/push";
import { persistPetPhoto } from "./uploads";
import type { PetHelpCategoryValue, PetReportTypeValue, PetSexValue, PetSizeValue, PetSpeciesValue, PetStatusValue } from "./pets.schemas";

const NEEDS_ANY_HELP: ReadonlySet<PetReportTypeValue> = new Set(["needs_help", "injured"]);

function serializePetReport(pet: Prisma.PetReportGetPayload<Record<string, never>>) {
  return {
    id: pet.id,
    reportType: pet.reportType,
    species: pet.species,
    name: pet.name,
    breed: pet.breed,
    sex: pet.sex,
    size: pet.size,
    primaryColor: pet.primaryColor,
    distinctiveFeatures: pet.distinctiveFeatures,
    description: pet.description,
    imageUrl: pet.imageUrl,
    status: pet.status,
    helpCategory: pet.helpCategory,
    isEmergency: pet.isEmergency,
    departmentName: pet.departmentName,
    municipalityName: pet.municipalityName,
    localityName: pet.localityName,
    approxLocationText: pet.approxLocationText,
    lat: pet.lat,
    lng: pet.lng,
    locationSource: pet.locationSource,
    happenedAt: pet.happenedAt,
    isSheltered: pet.isSheltered,
    createdById: pet.createdById,
    createdAt: pet.createdAt,
    lastConfirmedAt: pet.lastConfirmedAt,
  };
}

function initialStatus(reportType: PetReportTypeValue, isSheltered: boolean): PetStatusValue {
  if (reportType === "lost") return "lost";
  if (reportType === "found") return isSheltered ? "sheltered" : "sighted";
  return "needs_help";
}

const PUSH_COPY: Record<PetReportTypeValue, { emoji: string; label: string }> = {
  lost: { emoji: "🐾", label: "Mascota perdida" },
  found: { emoji: "🐾", label: "Mascota encontrada" },
  injured: { emoji: "🚑", label: "Mascota herida" },
  needs_help: { emoji: "🐾", label: "Mascota necesita ayuda" },
};

async function loadPetReport(id: string) {
  const pet = await prisma.petReport.findUnique({ where: { id } });
  if (!pet || pet.deletedAt) throw new HttpError(404, "Reporte de mascota no encontrado.");
  return pet;
}

/**
 * Publicar sin cuenta, mismo criterio que reportes: sin `actor.userId`, hace
 * falta nombre + (correo o celular, no ambos — igual que confirmar, no como
 * publicar un reporte, que sí exige ambos juntos). Si `isSheltered`, se
 * aplica `coarsenCoordinates()` (mismo helper que `isSensitive` en
 * reportes) — nunca se persiste la dirección exacta de una vivienda
 * privada donde alguien está resguardando al animal.
 */
export async function createPetReport(
  actor: { userId?: string; email?: string; phone?: string; displayName?: string },
  input: {
    reportType: PetReportTypeValue;
    species: PetSpeciesValue;
    name?: string;
    breed?: string;
    sex?: PetSexValue;
    size?: PetSizeValue;
    primaryColor?: string;
    distinctiveFeatures?: string;
    description: string;
    departmentName: string;
    municipalityName: string;
    localityName?: string;
    locationSource: "gps" | "catalog" | "manual";
    approxLocationText?: string;
    lat: number;
    lng: number;
    happenedAt?: Date;
    isSheltered: boolean;
    helpCategory?: PetHelpCategoryValue;
    isEmergency: boolean;
  },
  photoBuffer?: Buffer
) {
  let userId = actor.userId;
  if (!userId) {
    if (!actor.email && !actor.phone) {
      throw new HttpError(400, "Agrega tu nombre y tu correo o celular para reportar sin cuenta.");
    }
    const email = actor.email ?? syntheticEmailForPhone(actor.phone!);
    userId = await resolveGuestContact(email, actor.phone, actor.displayName);
  }

  if (NEEDS_ANY_HELP.has(input.reportType) && !input.helpCategory) {
    throw new HttpError(400, "Indica qué tipo de ayuda necesita.");
  }

  // Solo tiene sentido "resguardada" para una mascota encontrada — cualquier
  // otro tipo de reporte lo ignora, sin importar qué haya mandado el cliente.
  const isSheltered = input.reportType === "found" && input.isSheltered;
  const coords = isSheltered ? coarsenCoordinates(input.lat, input.lng) : { lat: input.lat, lng: input.lng };

  let imageUrl: string | undefined;
  if (photoBuffer) {
    imageUrl = await persistPetPhoto(photoBuffer);
  }

  const pet = await prisma.petReport.create({
    data: {
      reportType: input.reportType,
      species: input.species,
      name: input.name,
      breed: input.breed,
      sex: input.sex,
      size: input.size,
      primaryColor: input.primaryColor,
      distinctiveFeatures: input.distinctiveFeatures,
      description: input.description,
      imageUrl,
      status: initialStatus(input.reportType, isSheltered),
      helpCategory: NEEDS_ANY_HELP.has(input.reportType) ? input.helpCategory : null,
      isEmergency: NEEDS_ANY_HELP.has(input.reportType) ? input.isEmergency : null,
      departmentName: input.departmentName,
      municipalityName: input.municipalityName,
      localityName: input.localityName,
      approxLocationText: isSheltered ? "Ubicación aproximada (precisión reducida)" : input.approxLocationText,
      lat: coords.lat,
      lng: coords.lng,
      locationSource: input.locationSource,
      happenedAt: input.happenedAt,
      isSheltered,
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { actorId: userId, action: "pet.create", entityType: "pet_report", entityId: pet.id },
  });

  const copy = PUSH_COPY[input.reportType];
  broadcastPush({
    title: `${copy.emoji} ${copy.label}`,
    body: `${pet.municipalityName}, ${pet.departmentName}`,
    url: `/mascotas/${pet.id}`,
  }).catch(() => {});

  return serializePetReport(pet);
}

export async function listPetReports(filters: {
  reportType?: PetReportTypeValue;
  species?: PetSpeciesValue;
  status?: PetStatusValue;
  departmentName?: string;
  municipalityName?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.PetReportWhereInput = {
    deletedAt: null,
    hidden: false,
    ...(filters.reportType ? { reportType: filters.reportType } : {}),
    ...(filters.species ? { species: filters.species } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
    ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
  };

  const [pets, total] = await Promise.all([
    prisma.petReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.petReport.count({ where }),
  ]);

  return { pets: pets.map(serializePetReport), total, page: filters.page, pageSize: filters.pageSize };
}

// confirmationsCount/incorrectCount solo se calculan acá, no en
// listPetReports/listAllPetReports — 2 counts dirigidos por fila está bien
// en un detalle, pero sumaría un N+1 real sobre hasta 100 filas de un
// listado. El mapa/tarjetas no necesitan este número, solo el indicador de
// confianza del detalle.
export async function getPetReport(id: string) {
  const pet = await loadPetReport(id);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");
  const [confirmationsCount, incorrectCount] = await Promise.all([
    prisma.petConfirmation.count({ where: { petReportId: id, type: "confirm" } }),
    prisma.petConfirmation.count({ where: { petReportId: id, type: "incorrect" } }),
  ]);
  return { ...serializePetReport(pet), confirmationsCount, incorrectCount };
}

/**
 * Comunitario, no restringido al creador — mismo criterio que
 * `updateNeedStatus` en reportes, no una máquina nueva de verificación de
 * dueño para una mascota que pudo haber creado un invitado sin sesión.
 *
 * A diferencia de `updateNeedStatus` (que deja una línea en el timeline
 * público del reporte), acá no hay timeline todavía — así que cada cambio
 * de estado escribe en el `AuditLog` genérico que ya existe, para que quede
 * visible en el panel de moderación y se pueda revertir si alguien marca
 * "reunida" (la métrica norte del documento) de mala fe. No cambia quién
 * puede hacer el cambio, solo asegura que quede rastro.
 */
export async function updatePetStatus(id: string, userId: string, input: { status: PetStatusValue; note?: string }) {
  const pet = await loadPetReport(id);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");

  await prisma.petReport.update({
    where: { id },
    data: { status: input.status, lastConfirmedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "pet.status_update",
      entityType: "pet_report",
      entityId: id,
      metadata: { from: pet.status, to: input.status, note: input.note ?? null },
    },
  });

  return getPetReport(id);
}

export async function listAllPetReports(filters: { departmentName?: string; municipalityName?: string }) {
  const pets = await prisma.petReport.findMany({
    where: {
      deletedAt: null,
      ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
      ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return pets.map((pet) => ({ ...serializePetReport(pet), hidden: pet.hidden }));
}

export async function moderatePetReport(
  adminId: string,
  id: string,
  action: "hide" | "unhide" | "delete",
  reason: string
) {
  const pet = await prisma.petReport.findUnique({ where: { id } });
  if (!pet || pet.deletedAt) throw new HttpError(404, "Reporte de mascota no encontrado.");

  if (action === "hide") {
    await prisma.petReport.update({ where: { id }, data: { hidden: true } });
  } else if (action === "unhide") {
    await prisma.petReport.update({ where: { id }, data: { hidden: false } });
  } else {
    await prisma.petReport.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  await prisma.auditLog.create({
    data: { actorId: adminId, action: `pet.moderation.${action}`, entityType: "pet_report", entityId: id, metadata: { reason } },
  });

  if (action === "delete") return null;
  const updated = await prisma.petReport.findUniqueOrThrow({ where: { id } });
  return { ...serializePetReport(updated), hidden: updated.hidden };
}

/**
 * Confirmar/marcar incorrecto, Fase 2 — mismo criterio que confirmReport en
 * reportes: sin cuenta, exige nombre + (correo o celular). Primera señal de
 * confianza para mascotas, deliberadamente sin trustScore/decay como el de
 * reportes — solo un conteo simple (ver getPetReport arriba).
 */
export async function confirmPet(
  petId: string,
  actor: { userId?: string; email?: string; phone?: string; displayName?: string },
  type: "confirm" | "incorrect"
) {
  let userId = actor.userId;
  if (!userId) {
    if (!actor.email && !actor.phone) {
      throw new HttpError(400, "Agrega tu nombre y tu correo o celular para confirmar sin cuenta.");
    }
    const email = actor.email ?? syntheticEmailForPhone(actor.phone!);
    userId = await resolveGuestContact(email, actor.phone, actor.displayName);
  }

  const pet = await loadPetReport(petId);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");

  try {
    await prisma.petConfirmation.create({ data: { petReportId: petId, userId, type } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Ya registraste este tipo de confirmación para esta mascota.");
    }
    throw err;
  }

  if (type === "confirm") {
    await prisma.petReport.update({ where: { id: petId }, data: { lastConfirmedAt: new Date() } });
    await rewardUsefulConfirmation(userId, pet.createdById);
  }

  return getPetReport(petId);
}

function serializeSighting(sighting: { id: string; lat: number | null; lng: number | null; note: string | null; createdAt: Date }) {
  // Nunca se expone userId/displayName — mismo criterio que needCommitments,
  // que anonimiza a "un colaborador" en vez del nombre real de quien ayudó.
  return { id: sighting.id, lat: sighting.lat, lng: sighting.lng, note: sighting.note, createdAt: sighting.createdAt };
}

/** "LA VI AQUÍ", Fase 2 — mismo guest-resolution que confirmar, userId nunca null. */
export async function createPetSighting(
  petId: string,
  actor: { userId?: string; email?: string; phone?: string; displayName?: string },
  input: { lat?: number; lng?: number; note?: string }
) {
  let userId = actor.userId;
  if (!userId) {
    if (!actor.email && !actor.phone) {
      throw new HttpError(400, "Agrega tu nombre y tu correo o celular para reportar un avistamiento sin cuenta.");
    }
    const email = actor.email ?? syntheticEmailForPhone(actor.phone!);
    userId = await resolveGuestContact(email, actor.phone, actor.displayName);
  }

  const pet = await loadPetReport(petId);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");

  const sighting = await prisma.petSighting.create({
    data: { petReportId: petId, userId, lat: input.lat, lng: input.lng, note: input.note },
  });

  return serializeSighting(sighting);
}

export async function listPetSightings(petId: string) {
  await getPetReport(petId); // 404 si no existe/oculta — mismo guard que el resto de sub-recursos
  const sightings = await prisma.petSighting.findMany({
    where: { petReportId: petId },
    orderBy: { createdAt: "desc" },
  });
  return sightings.map(serializeSighting);
}

type PetReportRow = Prisma.PetReportGetPayload<Record<string, never>>;

// "Lado perdida" vs. "lado encontrada" del ciclo de vida — la mascota puede
// estar en cualquiera de los dos lados independientemente de su reportType
// original (ej. una found+resguardada sigue del lado "encontrada"). needs_help/
// reunited/possible_match/closed/outdated no participan del emparejamiento.
const LOST_SIDE_STATUSES: PetStatusValue[] = ["lost"];
const FOUND_SIDE_STATUSES: PetStatusValue[] = ["sighted", "sheltered", "found"];

function sideStatuses(status: PetStatusValue, sameSide: boolean): PetStatusValue[] | null {
  const isLostSide = LOST_SIDE_STATUSES.includes(status);
  const isFoundSide = FOUND_SIDE_STATUSES.includes(status);
  if (!isLostSide && !isFoundSide) return null;
  if (sameSide) return isLostSide ? LOST_SIDE_STATUSES : FOUND_SIDE_STATUSES;
  return isLostSide ? FOUND_SIDE_STATUSES : LOST_SIDE_STATUSES;
}

const MATCH_RADIUS_METERS = 15_000;
const MATCH_DATE_WINDOW_DAYS = 30;

/**
 * Posibles coincidencias (Fase 2, sameType: false, lost↔found) y detección
 * de duplicados (Fase 4, sameType: true, lost↔lost o found↔found) comparten
 * este mismo cálculo — bounding-box + Haversine, igual que findNearbyReports
 * en reports.service.ts. Calculado al leer, nunca persistido/cron — misma
 * filosofía que el resto de valores derivados de este backend.
 */
export async function findPossibleMatches(pet: PetReportRow, options: { sameType: boolean }) {
  const statuses = sideStatuses(pet.status, options.sameType);
  if (!statuses) return [];

  const latDelta = MATCH_RADIUS_METERS / 111_320;
  const lngDelta = MATCH_RADIUS_METERS / (111_320 * Math.cos((pet.lat * Math.PI) / 180));
  const effectiveDate = pet.happenedAt ?? pet.createdAt;
  const dateFrom = new Date(effectiveDate.getTime() - MATCH_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const dateTo = new Date(effectiveDate.getTime() + MATCH_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.petReport.findMany({
    where: {
      id: { not: pet.id },
      deletedAt: null,
      hidden: false,
      species: pet.species,
      status: { in: statuses },
      lat: { gte: pet.lat - latDelta, lte: pet.lat + latDelta },
      lng: { gte: pet.lng - lngDelta, lte: pet.lng + lngDelta },
    },
    take: 500,
  });

  return candidates
    .filter((c) => {
      const cDate = c.happenedAt ?? c.createdAt;
      return cDate >= dateFrom && cDate <= dateTo && haversineMeters(pet.lat, pet.lng, c.lat, c.lng) <= MATCH_RADIUS_METERS;
    })
    .map((c) => ({ ...serializePetReport(c), distanceMeters: Math.round(haversineMeters(pet.lat, pet.lng, c.lat, c.lng)) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export async function getPossibleMatches(petId: string) {
  const pet = await loadPetReport(petId);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");
  return findPossibleMatches(pet, { sameType: false });
}

/**
 * Revelar contacto, Fase 2 — decisión de producto explícita: mostrar el
 * correo/celular real de quien reportó en vez de construir mensajería
 * interna (ver plan). Quien lo pide, con o sin sesión, debe traer su propio
 * nombre+contacto (mismo patrón anti-scrape que confirmar), y el rate
 * limiter (revealContactLimiter) NUNCA se salta para usuarios con sesión —
 * a diferencia de guestActionLimiter, acá cualquier cuenta puede rasparse
 * contactos igual de rápido que un invitado.
 */
export async function revealPetContact(
  petId: string,
  requester: { userId?: string; email?: string; phone?: string; displayName?: string }
) {
  const pet = await loadPetReport(petId);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");

  let revealerId = requester.userId;
  if (!revealerId) {
    if (!requester.displayName || (!requester.email && !requester.phone)) {
      throw new HttpError(400, "Agrega tu nombre y tu correo o celular para ver el contacto.");
    }
    const email = requester.email ?? syntheticEmailForPhone(requester.phone!);
    revealerId = await resolveGuestContact(email, requester.phone, requester.displayName);
  }

  const creator = await prisma.user.findUniqueOrThrow({ where: { id: pet.createdById } });

  // Guard contra el correo sintético de un guest que solo dio celular — ese
  // valor (tel-XXXX@guest.aquiayudamosve.local) nunca debe mostrarse como si
  // fuera un correo real (ver lib/guestIdentity.ts#syntheticEmailForPhone).
  const email = creator.phone && creator.email === syntheticEmailForPhone(creator.phone) ? undefined : creator.email;

  await prisma.auditLog.create({
    data: {
      actorId: revealerId,
      action: "pet.contact_revealed",
      entityType: "pet_report",
      entityId: petId,
      // Nunca el correo/celular revelado acá — ya vive en User, duplicarlo
      // en un Json de auditoría sería una segunda copia sin protección de
      // un dato ya sensible.
      metadata: { revealedToUserId: revealerId },
    },
  });

  return { displayName: creator.displayName, email, phone: creator.phone ?? undefined };
}
