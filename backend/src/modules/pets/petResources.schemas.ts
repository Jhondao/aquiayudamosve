import { z } from "zod";

export const PET_RESOURCE_CATEGORY_VALUES = [
  "veterinary",
  "transport",
  "temporary_home",
  "attention_point",
  "rescue",
  "other",
] as const;
export type PetResourceCategoryValue = (typeof PET_RESOURCE_CATEGORY_VALUES)[number];

// JSON plano (nunca multipart) — un recurso no lleva foto en Fase 3.
export const createPetResourceSchema = z.object({
  category: z.enum(PET_RESOURCE_CATEGORY_VALUES),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(4).max(1000),
  contactName: z.string().trim().min(2).max(80),
  contactEmail: z.string().trim().toLowerCase().email().optional(),
  contactPhone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
  departmentName: z.string().trim().min(2).max(100),
  municipalityName: z.string().trim().min(2).max(100),
  availabilityNote: z.string().trim().min(2).max(300).optional(),
});

export const listPetResourcesQuerySchema = z.object({
  category: z.enum(PET_RESOURCE_CATEGORY_VALUES).optional(),
  departmentName: z.string().trim().min(1).max(100).optional(),
  municipalityName: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const petResourceModerationActionSchema = z.object({
  action: z.enum(["hide", "unhide", "delete"]),
  reason: z.string().trim().min(3).max(500),
});
