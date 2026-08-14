import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { PetResourceCategoryValue } from "./petResources.schemas";

function serializePetResource(resource: Prisma.PetResourceGetPayload<Record<string, never>>) {
  return {
    id: resource.id,
    category: resource.category,
    name: resource.name,
    description: resource.description,
    contactName: resource.contactName,
    contactEmail: resource.contactEmail,
    contactPhone: resource.contactPhone,
    departmentName: resource.departmentName,
    municipalityName: resource.municipalityName,
    availabilityNote: resource.availabilityNote,
    createdById: resource.createdById,
    createdAt: resource.createdAt,
  };
}

/**
 * "Quiero ayudar con mascotas", Fase 3 — requireAuth para crear (ver
 * pets.routes.ts): ofrecer un servicio compromete tu identidad, a
 * diferencia de reportar una mascota, que sigue siendo anónimo-friendly.
 * "contactEmail o contactPhone" vive acá, no en el schema Zod — mismo
 * motivo que NEEDS_ANY_HELP en pets.service.ts: validateBody está tipado
 * AnyZodObject, no acepta .refine().
 */
export async function createPetResource(
  userId: string,
  input: {
    category: PetResourceCategoryValue;
    name: string;
    description: string;
    contactName: string;
    contactEmail?: string;
    contactPhone?: string;
    departmentName: string;
    municipalityName: string;
    availabilityNote?: string;
  }
) {
  if (!input.contactEmail && !input.contactPhone) {
    throw new HttpError(400, "Agrega un correo o celular de contacto.");
  }

  const resource = await prisma.petResource.create({ data: { ...input, createdById: userId } });

  // Mismo mecanismo que pet.create/pet.status_update — toda acción create*
  // de este backend deja rastro en el AuditLog genérico.
  await prisma.auditLog.create({
    data: { actorId: userId, action: "pet_resource.create", entityType: "pet_resource", entityId: resource.id },
  });

  return serializePetResource(resource);
}

export async function listPetResources(filters: {
  category?: PetResourceCategoryValue;
  departmentName?: string;
  municipalityName?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.PetResourceWhereInput = {
    deletedAt: null,
    hidden: false,
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
    ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
  };

  const [resources, total] = await Promise.all([
    prisma.petResource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.petResource.count({ where }),
  ]);

  return { resources: resources.map(serializePetResource), total, page: filters.page, pageSize: filters.pageSize };
}

async function loadPetResource(id: string) {
  const resource = await prisma.petResource.findUnique({ where: { id } });
  if (!resource || resource.deletedAt) throw new HttpError(404, "Recurso no encontrado.");
  return resource;
}

export async function getPetResource(id: string) {
  const resource = await loadPetResource(id);
  if (resource.hidden) throw new HttpError(404, "Recurso no encontrado.");
  return serializePetResource(resource);
}

export async function listAllPetResources(filters: { departmentName?: string; municipalityName?: string }) {
  const resources = await prisma.petResource.findMany({
    where: {
      deletedAt: null,
      ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
      ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return resources.map((resource) => ({ ...serializePetResource(resource), hidden: resource.hidden }));
}

export async function moderatePetResource(
  adminId: string,
  id: string,
  action: "hide" | "unhide" | "delete",
  reason: string
) {
  const resource = await prisma.petResource.findUnique({ where: { id } });
  if (!resource || resource.deletedAt) throw new HttpError(404, "Recurso no encontrado.");

  if (action === "hide") {
    await prisma.petResource.update({ where: { id }, data: { hidden: true } });
  } else if (action === "unhide") {
    await prisma.petResource.update({ where: { id }, data: { hidden: false } });
  } else {
    await prisma.petResource.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: `pet_resource.moderation.${action}`,
      entityType: "pet_resource",
      entityId: id,
      metadata: { reason },
    },
  });

  if (action === "delete") return null;
  const updated = await prisma.petResource.findUniqueOrThrow({ where: { id } });
  return { ...serializePetResource(updated), hidden: updated.hidden };
}
