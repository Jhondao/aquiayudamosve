import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { confirmationLimiter, createReportLimiter, guestActionLimiter } from "../../middleware/rateLimit";
import { validateBody, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../middleware/errorHandler";
import { requireRecaptchaForGuests } from "../../lib/recaptcha";
import {
  addEvidence,
  addReportUpdate,
  confirmReport,
  createCommitment,
  createReport,
  findNearbyReports,
  flagReport,
  getReport,
  listReports,
  updateCommitment,
  updateNeedStatus,
} from "./reports.service";
import {
  confirmSchema,
  createCommitmentSchema,
  createReportSchema,
  flagSchema,
  listQuerySchema,
  nearbyQuerySchema,
  needStatusSchema,
  updateCommitmentSchema,
  updateSchema,
} from "./reports.schemas";
import { persistEvidenceImage, uploadEvidenceImage } from "./uploads";
import { getOrCreateShareCard, recordShareEvent } from "../share/shareCard.service";
import { shareEventSchema } from "../share/share.schemas";

const router = Router();

router.get("/", validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    res.json(await listReports(req.query as never));
  } catch (err) {
    next(err);
  }
});

router.get("/nearby", validateQuery(nearbyQuerySchema), async (req, res, next) => {
  try {
    const q = req.query as unknown as { lat: number; lng: number; radiusMeters: number; categoryKey?: string };
    res.json({ reports: await findNearbyReports(q) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getReport(req.params.id, req.user?.id));
  } catch (err) {
    next(err);
  }
});

// No requireAuth: publishing must not require an account (see reports.service.ts#resolveGuestContact).
router.post("/", createReportLimiter, validateBody(createReportSchema), async (req, res, next) => {
  try {
    const { email, phone, ...input } = req.body;
    res.status(201).json(await createReport({ userId: req.user?.id, email, phone }, input));
  } catch (err) {
    next(err);
  }
});

// No requireAuth: confirmar/marcar dudoso/marcar incorrecto tampoco debe
// pedir cuenta (mismo criterio que publicar — resolveGuestContact en
// reports.service.ts). guestActionLimiter (más estricto, por IP, se salta a
// sí mismo si ya hay sesión) + confirmationLimiter + reCAPTCHA (solo exige
// algo si Google marcó el token como inválido — ver requireRecaptchaForGuests)
// son la defensa anti-spam de reemplazo.
router.post(
  "/:id/confirm",
  guestActionLimiter,
  confirmationLimiter,
  validateBody(confirmSchema),
  requireRecaptchaForGuests("CONFIRM_REPORT"),
  async (req, res, next) => {
    try {
      const { type, email, phone, displayName } = req.body;
      res.json(await confirmReport(req.params.id, { userId: req.user?.id, email, phone, displayName }, type));
    } catch (err) {
      next(err);
    }
  }
);

router.post("/:id/flag", requireAuth, confirmationLimiter, validateBody(flagSchema), async (req, res, next) => {
  try {
    res.json(await flagReport(req.params.id, req.user!.id, req.body.reason));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/update", requireAuth, confirmationLimiter, validateBody(updateSchema), async (req, res, next) => {
  try {
    res.json(await addReportUpdate(req.params.id, req.user!.id, req.body.text, req.body.deactivates));
  } catch (err) {
    next(err);
  }
});

// Fase 1 del PROMPT MAESTRO — mismo nivel de acceso que confirm/flag/update
// (comunitario, no restringido al creador del reporte).
router.post("/:id/need-status", requireAuth, confirmationLimiter, validateBody(needStatusSchema), async (req, res, next) => {
  try {
    res.json(await updateNeedStatus(req.params.id, req.user!.id, req.body));
  } catch (err) {
    next(err);
  }
});

// PROMPT MAESTRO v3, Fase A — mismo nivel comunitario que confirm/flag/update/need-status.
router.post("/:id/commitments", requireAuth, confirmationLimiter, validateBody(createCommitmentSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createCommitment(req.params.id, req.user!.id, req.body));
  } catch (err) {
    next(err);
  }
});

// Único endpoint de este módulo con ownership check — el service devuelve 403 si no es tu compromiso.
router.patch("/:id/commitments/:commitmentId", requireAuth, confirmationLimiter, validateBody(updateCommitmentSchema), async (req, res, next) => {
  try {
    res.json(await updateCommitment(req.params.id, req.params.commitmentId, req.user!.id, req.body));
  } catch (err) {
    next(err);
  }
});

// PROMPT MAESTRO — COMPARTIR REPORTES CONFIRMADOS POR WHATSAPP. Pública, sin
// auth (compartir un reporte no requiere sesión) — solo genera pieza visual
// para reportes confirmados/institucionales/cubiertos/con excedente, ver
// shareCard.service.ts#determineShareStatus.
router.get("/:id/share-card", async (req, res, next) => {
  try {
    res.json(await getOrCreateShareCard(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Fire-and-forget: nunca bloquea la UI de compartir si falla (mismo criterio
// que broadcastPush). Pública — compartir no requiere sesión, pero registra
// el usuario si hay uno.
router.post("/:id/share-event", confirmationLimiter, validateBody(shareEventSchema), async (req, res, next) => {
  try {
    await recordShareEvent(req.params.id, req.user?.id, req.body.channel);
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/evidence", requireAuth, confirmationLimiter, uploadEvidenceImage, async (req, res, next) => {
  try {
    const sourceUrl = typeof req.body.sourceUrl === "string" ? req.body.sourceUrl.slice(0, 500) : undefined;
    const relatedOrgName = typeof req.body.relatedOrgName === "string" ? req.body.relatedOrgName.slice(0, 200) : undefined;

    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      throw new HttpError(400, "El enlace de la fuente debe ser una URL http(s) válida.");
    }

    let imageUrl: string | undefined;
    if (req.file) {
      imageUrl = await persistEvidenceImage(req.file.buffer);
    }

    if (!imageUrl && !sourceUrl) {
      throw new HttpError(400, "Agrega una foto o un enlace de fuente.");
    }

    res.status(201).json(await addEvidence(req.params.id, req.user!.id, { imageUrl, sourceUrl, relatedOrgName }));
  } catch (err) {
    next(err);
  }
});

export default router;
