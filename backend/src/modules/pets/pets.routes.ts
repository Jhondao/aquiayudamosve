import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { confirmationLimiter, createPetReportLimiter } from "../../middleware/rateLimit";
import { validateBody, validateQuery } from "../../middleware/validate";
import { requireRecaptchaForGuests } from "../../lib/recaptcha";
import { createPetReport, getPetReport, listPetReports, updatePetStatus } from "./pets.service";
import { createPetReportSchema, listPetReportsQuerySchema, updatePetStatusSchema } from "./pets.schemas";
import { uploadPetPhoto } from "./uploads";
import { getOrCreatePetShareCard, recordPetShareEvent } from "./petShareCard.service";
import { shareEventSchema } from "../share/share.schemas";

const router = Router();

router.get("/", validateQuery(listPetReportsQuerySchema), async (req, res, next) => {
  try {
    res.json(await listPetReports(req.query as never));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getPetReport(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Sin requireAuth: reportar una mascota tampoco pide cuenta (mismo criterio
// que reportes). La foto viaja en el mismo request (multipart), no como
// paso aparte — ver pets.schemas.ts. Orden de middleware importa: multer
// puebla req.body con los campos de texto antes de llamar a next(), así que
// validateBody corriendo después sí los ve.
router.post(
  "/",
  createPetReportLimiter,
  uploadPetPhoto,
  validateBody(createPetReportSchema),
  requireRecaptchaForGuests("CREATE_PET_REPORT"),
  async (req, res, next) => {
    try {
      const { displayName, email, phone, recaptchaToken, website, ...input } = req.body;
      void recaptchaToken;
      void website;
      const pet = await createPetReport(
        { userId: req.user?.id, email, phone, displayName },
        input,
        req.file?.buffer
      );
      res.status(201).json(pet);
    } catch (err) {
      next(err);
    }
  }
);

// Comunitario, no restringido al creador — mismo criterio que
// update-need-status de reportes (ver pets.service.ts#updatePetStatus para
// el porqué, incluida la nota sobre por qué esto escribe en AuditLog).
router.patch(
  "/:id/status",
  requireAuth,
  confirmationLimiter,
  validateBody(updatePetStatusSchema),
  async (req, res, next) => {
    try {
      res.json(await updatePetStatus(req.params.id, req.user!.id, req.body));
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id/share-card", async (req, res, next) => {
  try {
    res.json(await getOrCreatePetShareCard(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/share-event", confirmationLimiter, validateBody(shareEventSchema), async (req, res, next) => {
  try {
    await recordPetShareEvent(req.params.id, req.user?.id, req.body.channel);
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
