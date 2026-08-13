import { z } from "zod";

// Categories flagged as potentially exposing vulnerable people (section 24).
export const SENSITIVE_CATEGORY_KEYS = new Set([
  "personas_heridas",
  "personas_vulnerables",
  "rescate_requerido",
]);

export const createReportSchema = z.object({
  categoryKey: z.string().min(1),
  title: z.string().trim().min(4).max(140),
  description: z.string().trim().min(4).max(2000),
  // ACTUALIZACIÓN DEL PROMPT MAESTRO — cobertura nacional: texto libre,
  // nunca validado contra un catálogo/enum. Nunca bloquear una publicación
  // porque el lugar no esté en una lista predeterminada (secciones 3/8/33).
  departmentName: z.string().trim().min(2).max(100),
  municipalityName: z.string().trim().min(2).max(100),
  localityName: z.string().trim().min(2).max(150).optional(),
  locationSource: z.enum(["gps", "catalog", "manual"]),
  approxLocationText: z.string().trim().min(2).max(200).optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  // Only applied when categoryKey belongs to group "necesidad" (reports.service.ts#createReport)
  // — ignored silently otherwise, same pattern as isSensitive/coarsening.
  quantityNeeded: z.number().positive().max(1_000_000).optional(),
  quantityUnit: z.string().trim().min(1).max(20).optional(),
  // Only required when publishing without a session — see reports.routes.ts.
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Celular inválido.")
    .optional(),
});

export const confirmSchema = z.object({
  type: z.enum(["confirm", "unsure", "incorrect"]),
  shareLocation: z.boolean().optional(),
  approxLat: z.number().gte(-90).lte(90).optional(),
  approxLng: z.number().gte(-180).lte(180).optional(),
});

export const flagSchema = z.object({
  reason: z.string().trim().min(4).max(500),
});

export const updateSchema = z.object({
  text: z.string().trim().min(2).max(300),
  deactivates: z.boolean().optional(),
});

// Fase 1 del PROMPT MAESTRO — "estado ampliado de necesidades". Sin
// .refine(): validateBody() está tipado como AnyZodObject, y .refine()
// devuelve ZodEffects (no compila). El guard "al menos un campo" vive en
// reports.service.ts#updateNeedStatus.
export const NEED_STATUS_VALUES = [
  "necesitamos",
  "en_camino",
  "parcialmente_cubierto",
  "cubierto",
  "excedente",
  "desactualizado",
] as const;
export type NeedStatusValue = (typeof NEED_STATUS_VALUES)[number];

export const needStatusLabels: Record<NeedStatusValue, string> = {
  necesitamos: "Necesitamos",
  en_camino: "Ayuda en camino",
  parcialmente_cubierto: "Parcialmente cubierto",
  cubierto: "Cubierto — no traer más",
  excedente: "Excedente",
  desactualizado: "Desactualizado",
};

export const needStatusSchema = z.object({
  needStatus: z.enum(NEED_STATUS_VALUES).optional(),
  quantityReceived: z.number().min(0).max(1_000_000).optional(),
});

export const listQuerySchema = z.object({
  departmentName: z.string().trim().min(1).max(100).optional(),
  municipalityName: z.string().trim().min(1).max(100).optional(),
  group: z.enum(["ayuda", "necesidad", "critico", "info"]).optional(),
  institutional: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// PROMPT MAESTRO v3, Fase A — compromiso parcial de ayuda. Sin .refine() en
// updateCommitmentSchema por el mismo motivo que needStatusSchema.
export const COMMITMENT_STATUS_VALUES = ["committed", "on_the_way", "delivered", "cancelled"] as const;
export type CommitmentStatusValue = (typeof COMMITMENT_STATUS_VALUES)[number];

export const createCommitmentSchema = z.object({
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20).optional(),
  // Solo se puede *crear* un compromiso prometido o en camino — no tiene
  // sentido nacer ya entregado/cancelado.
  status: z.enum(["committed", "on_the_way"]).optional(),
  estimatedArrival: z.coerce.date().optional(),
  transportMethod: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().min(1).max(300).optional(),
});

export const updateCommitmentSchema = z.object({
  status: z.enum(COMMITMENT_STATUS_VALUES).optional(),
  estimatedArrival: z.coerce.date().optional(),
  note: z.string().trim().min(1).max(300).optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  // Sin filtro de ciudad/municipio (arregla el bug de duplicados de la
  // sección 29: la detección debe usar distancia real, no nombre de lugar).
  // Tope subido de 5km a 50km porque HomePage reusa este mismo endpoint
  // para "Cerca de mí", que necesita radio de escala ciudad, no de cuadra.
  radiusMeters: z.coerce.number().min(10).max(50_000).optional().default(300),
  categoryKey: z.string().optional(),
});
