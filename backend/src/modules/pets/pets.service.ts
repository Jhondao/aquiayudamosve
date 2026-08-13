import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { coarsenCoordinates } from "../../utils/geo";
import { resolveGuestContact, syntheticEmailForPhone } from "../../lib/guestIdentity";
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

export async function getPetReport(id: string) {
  const pet = await loadPetReport(id);
  if (pet.hidden) throw new HttpError(404, "Reporte de mascota no encontrado.");
  return serializePetReport(pet);
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
