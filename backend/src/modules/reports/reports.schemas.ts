import { z } from "zod";

export const CITIES = ["Cali", "Pereira", "Manizales", "Armenia", "Quibdó"] as const;

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
  city: z.enum(CITIES),
  approxLocationText: z.string().trim().min(2).max(200),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
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

export const listQuerySchema = z.object({
  city: z.enum(CITIES).optional(),
  group: z.enum(["ayuda", "necesidad", "critico", "info"]).optional(),
  institutional: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  city: z.enum(CITIES),
  radiusMeters: z.coerce.number().min(10).max(5000).optional().default(300),
  categoryKey: z.string().optional(),
});
