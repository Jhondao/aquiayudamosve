import { z } from "zod";

export const moderationActionSchema = z.object({
  action: z.enum(["hide", "unhide", "markFalse", "resolve", "delete"]),
  reason: z.string().trim().min(3).max(500),
});

export const listAllReportsQuerySchema = z.object({
  departmentName: z.string().optional(),
  municipalityName: z.string().optional(),
  status: z.enum(["active", "inactive", "hidden"]).optional(),
});
