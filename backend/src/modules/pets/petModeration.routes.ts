import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { findDuplicatePets, listAllPetReports, mergePetReports, moderatePetReport } from "./pets.service";
import { mergePetReportSchema, petModerationActionSchema } from "./pets.schemas";

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

// Fase 4 — bajo demanda, no en cada carga del panel (ver
// pets.service.ts#findDuplicatePets). Nombre de ruta literal "duplicates",
// no colisiona con PATCH /:id (distinto método) ni con GET /:id (que este
// router no tiene — solo lista todo en GET /).
router.get("/duplicates", async (_req, res, next) => {
  try {
    res.json({ pairs: await findDuplicatePets() });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/merge", validateBody(mergePetReportSchema), async (req, res, next) => {
  try {
    const { intoId, reason } = req.body;
    res.json(await mergePetReports(req.user!.id, req.params.id, intoId, reason));
  } catch (err) {
    next(err);
  }
});

export default router;
