import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { createPetResourceLimiter } from "../../middleware/rateLimit";
import { validateBody, validateQuery } from "../../middleware/validate";
import { createPetResource, getPetResource, listPetResources } from "./petResources.service";
import { createPetResourceSchema, listPetResourcesQuerySchema } from "./petResources.schemas";

const router = Router();

router.get("/", validateQuery(listPetResourcesQuerySchema), async (req, res, next) => {
  try {
    res.json(await listPetResources(req.query as never));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getPetResource(req.params.id));
  } catch (err) {
    next(err);
  }
});

// requireAuth a propósito: ofrecer ayuda compromete tu identidad, a
// diferencia de reportar una mascota (que sigue siendo anónimo-friendly).
router.post("/", requireAuth, createPetResourceLimiter, validateBody(createPetResourceSchema), async (req, res, next) => {
  try {
    const resource = await createPetResource(req.user!.id, req.body);
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

export default router;
