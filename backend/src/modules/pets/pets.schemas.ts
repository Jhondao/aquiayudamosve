import { z } from "zod";

export const PET_REPORT_TYPE_VALUES = ["lost", "found", "injured", "needs_help"] as const;
export type PetReportTypeValue = (typeof PET_REPORT_TYPE_VALUES)[number];

export const PET_SPECIES_VALUES = ["dog", "cat", "bird", "rabbit", "horse", "other"] as const;
export type PetSpeciesValue = (typeof PET_SPECIES_VALUES)[number];

export const PET_SEX_VALUES = ["male", "female", "unknown"] as const;
export type PetSexValue = (typeof PET_SEX_VALUES)[number];

export const PET_SIZE_VALUES = ["small", "medium", "large"] as const;
export type PetSizeValue = (typeof PET_SIZE_VALUES)[number];

export const PET_STATUS_VALUES = [
  "lost",
  "sighted",
  "sheltered",
  "possible_match",
  "found",
  "reunited",
  "needs_help",
  "closed",
  "outdated",
] as const;
export type PetStatusValue = (typeof PET_STATUS_VALUES)[number];

export const PET_HELP_CATEGORY_VALUES = [
  "veterinary",
  "food",
  "water",
  "transport",
  "shelter",
  "rescue",
  "other",
] as const;
export type PetHelpCategoryValue = (typeof PET_HELP_CATEGORY_VALUES)[number];

// Un campo string requerido, coaccionado a número solo después de confirmar
// que no está vacío — z.coerce.number() solo() no sirve aquí: Number("") es
// 0 en JS, así que un lat/lng vacío pasaría silencioso como 0,0 en vez de
// fallar la validación.
const requiredNumericString = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, "Requerido.")
    .pipe(z.coerce.number().gte(min).lte(max));

// Mismo patrón que listQuerySchema.institutional en reports.schemas.ts — NO
// z.coerce.boolean(): Boolean("false") es true, cualquier string no vacío
// coacciona a verdadero.
const booleanString = z.string().optional().transform((v) => v === "true");

// POST /api/pets llega como multipart/form-data (la foto va en el mismo
// request que el resto de los campos — a diferencia de reportes, donde la
// evidencia es una llamada aparte — porque el documento fuente pide un
// flujo de "menos de 60 segundos" con la foto como parte central, no un
// segundo paso que alguien angustiado podría no completar). Eso significa
// que multer puebla req.body con strings para todo, incluidos los campos
// numéricos/booleanos — de ahí requiredNumericString/booleanString arriba
// en vez de z.coerce.number()/z.coerce.boolean() directo.
//
// helpCategory/isEmergency solo tienen sentido según reportType — igual que
// needStatusSchema, sin .refine() a nivel de objeto (validateBody está
// tipado AnyZodObject, .refine() devuelve ZodEffects). El guard vive en
// pets.service.ts.
export const createPetReportSchema = z.object({
  reportType: z.enum(PET_REPORT_TYPE_VALUES),
  species: z.enum(PET_SPECIES_VALUES),
  name: z.string().trim().min(1).max(60).optional(),
  breed: z.string().trim().min(1).max(60).optional(),
  sex: z.enum(PET_SEX_VALUES).optional(),
  size: z.enum(PET_SIZE_VALUES).optional(),
  primaryColor: z.string().trim().min(1).max(60).optional(),
  distinctiveFeatures: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(4).max(1000),
  departmentName: z.string().trim().min(2).max(100),
  municipalityName: z.string().trim().min(2).max(100),
  localityName: z.string().trim().min(2).max(150).optional(),
  locationSource: z.enum(["gps", "catalog", "manual"]),
  approxLocationText: z.string().trim().min(2).max(200).optional(),
  lat: requiredNumericString(-90, 90),
  lng: requiredNumericString(-180, 180),
  // z.coerce.date() sí falla ruidosamente ante un string vacío/inválido
  // (a diferencia de number/boolean) — no necesita el mismo tratamiento.
  happenedAt: z.coerce.date().optional(),
  isSheltered: booleanString,
  helpCategory: z.enum(PET_HELP_CATEGORY_VALUES).optional(),
  isEmergency: booleanString,
  // Invitado: nombre + (correo o celular, no ambos) — mismo criterio que
  // confirmar un reporte, no el de publicar un reporte (que sí exige ambos).
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
  recaptchaToken: z.string().min(1).optional(),
  // Honeypot anti-spam, mismo patrón que confirmSchema.
  website: z.string().max(0, "Campo inválido.").optional(),
});

export const updatePetStatusSchema = z.object({
  status: z.enum(PET_STATUS_VALUES),
  note: z.string().trim().min(1).max(300).optional(),
});

export const listPetReportsQuerySchema = z.object({
  reportType: z.enum(PET_REPORT_TYPE_VALUES).optional(),
  species: z.enum(PET_SPECIES_VALUES).optional(),
  status: z.enum(PET_STATUS_VALUES).optional(),
  departmentName: z.string().trim().min(1).max(100).optional(),
  municipalityName: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const petModerationActionSchema = z.object({
  action: z.enum(["hide", "unhide", "delete"]),
  reason: z.string().trim().min(3).max(500),
});

// Fase 4 — fusión de duplicados.
export const mergePetReportSchema = z.object({
  intoId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

// Fase 2 — confirmar/avistar/revelar contacto llegan como JSON plano (nunca
// multipart), así que z.boolean()/z.number() directo funcionan bien acá —
// requiredNumericString/booleanString arriba existen solo por el multipart
// de POST /api/pets, no aplican a estos tres schemas.

// Solo confirm/incorrect — la UI de mascotas nunca ofrece "unsure", aunque
// el enum de Prisma (reusado de ConfirmationType) sí lo permita.
export const petConfirmSchema = z.object({
  type: z.enum(["confirm", "incorrect"]),
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
  recaptchaToken: z.string().min(1).optional(),
  website: z.string().max(0, "Campo inválido.").optional(),
});

export const createPetSightingSchema = z.object({
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  note: z.string().trim().min(1).max(300).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
  recaptchaToken: z.string().min(1).optional(),
  website: z.string().max(0, "Campo inválido.").optional(),
});

export const revealPetContactSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
  recaptchaToken: z.string().min(1).optional(),
  website: z.string().max(0, "Campo inválido.").optional(),
});
