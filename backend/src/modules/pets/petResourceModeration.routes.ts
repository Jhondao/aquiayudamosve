import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { listAllPetResources, moderatePetResource } from "./petResources.service";
import { petResourceModerationActionSchema } from "./petResources.schemas";

// Mirror liviano de petModeration.routes.ts, mismo criterio: sin
// markFalse/resolve, conceptos de trustScore que este directorio no tiene.
const router = Router();

router.use(requireAuth, requireRole("moderator", "admin"));

router.get("/", async (req, res, next) => {
  try {
    res.json({ resources: await listAllPetResources(req.query as never) });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", validateBody(petResourceModerationActionSchema), async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    res.json(await moderatePetResource(req.user!.id, req.params.id, action, reason));
  } catch (err) {
    next(err);
  }
});

export default router;
