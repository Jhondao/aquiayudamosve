import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { confirmationLimiter, createPetReportLimiter, guestActionLimiter, revealContactLimiter } from "../../middleware/rateLimit";
import { validateBody, validateQuery } from "../../middleware/validate";
import { requireRecaptchaForGuests } from "../../lib/recaptcha";
import {
  confirmPet,
  createPetReport,
  createPetSighting,
  getPetReport,
  getPossibleMatches,
  listPetReports,
  listPetSightings,
  revealPetContact,
  updatePetStatus,
} from "./pets.service";
import {
  createPetReportSchema,
  createPetSightingSchema,
  listPetReportsQuerySchema,
  petConfirmSchema,
  revealPetContactSchema,
  updatePetStatusSchema,
} from "./pets.schemas";
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

// Fase 2 — confirmar/marcar incorrecto sin cuenta, mismo stack exacto que
// POST /reports/:id/confirm: guestActionLimiter (se salta a sí mismo con
// sesión) + confirmationLimiter + reCAPTCHA (solo bloquea si Google marcó
// el token inválido).
router.post(
  "/:id/confirm",
  guestActionLimiter,
  confirmationLimiter,
  validateBody(petConfirmSchema),
  requireRecaptchaForGuests("CONFIRM_PET"),
  async (req, res, next) => {
    try {
      const { type, email, phone, displayName } = req.body;
      res.json(await confirmPet(req.params.id, { userId: req.user?.id, email, phone, displayName }, type));
    } catch (err) {
      next(err);
    }
  }
);

// "LA VI AQUÍ" — mismo stack que confirmar, también sin cuenta.
router.post(
  "/:id/sightings",
  guestActionLimiter,
  confirmationLimiter,
  validateBody(createPetSightingSchema),
  requireRecaptchaForGuests("CREATE_PET_SIGHTING"),
  async (req, res, next) => {
    try {
      const { lat, lng, note, email, phone, displayName } = req.body;
      const sighting = await createPetSighting(req.params.id, { userId: req.user?.id, email, phone, displayName }, { lat, lng, note });
      res.status(201).json(sighting);
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id/sightings", async (req, res, next) => {
  try {
    res.json(await listPetSightings(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/possible-matches", async (req, res, next) => {
  try {
    res.json(await getPossibleMatches(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Revelar contacto — rate limiter propio y dedicado (revealContactLimiter,
// NUNCA se salta con sesión, ver pets.service.ts#revealPetContact), no
// guestActionLimiter: acá cualquier cuenta puede rasparse contactos igual
// de rápido que un invitado si no se limita parejo.
router.post(
  "/:id/reveal-contact",
  revealContactLimiter,
  validateBody(revealPetContactSchema),
  requireRecaptchaForGuests("REVEAL_PET_CONTACT"),
  async (req, res, next) => {
    try {
      const { email, phone, displayName } = req.body;
      res.json(await revealPetContact(req.params.id, { userId: req.user?.id, email, phone, displayName }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
