import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { listAllPetReports, moderatePetReport } from "./pets.service";
import { petModerationActionSchema } from "./pets.schemas";

// Mirror liviano de moderation.routes.ts, pero solo para mascotas — sin
// markFalse/resolve, esos son conceptos de trustScore que mascotas no tiene
// en Fase 1 (no hay sistema de confianza para reportes de mascotas todavía).
const router = Router();

router.use(requireAuth, requireRole("moderator", "admin"));

router.get("/", async (req, res, next) => {
  try {
    res.json({ pets: await listAllPetReports(req.query as never) });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", validateBody(petModerationActionSchema), async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    res.json(await moderatePetReport(req.user!.id, req.params.id, action, reason));
  } catch (err) {
    next(err);
  }
});

export default router;
