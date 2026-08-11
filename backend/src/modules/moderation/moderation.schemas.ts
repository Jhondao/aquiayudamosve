import { z } from "zod";

export const moderationActionSchema = z.object({
  action: z.enum(["hide", "unhide", "markFalse"]),
  reason: z.string().trim().min(3).max(500),
});
