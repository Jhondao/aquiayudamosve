import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { confirmationLimiter, createReportLimiter } from "../../middleware/rateLimit";
import { validateBody, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../middleware/errorHandler";
import {
  addEvidence,
  addReportUpdate,
  confirmReport,
  createReport,
  findNearbyReports,
  flagReport,
  getReport,
  listReports,
  updateNeedStatus,
} from "./reports.service";
import {
  confirmSchema,
  createReportSchema,
  flagSchema,
  listQuerySchema,
  nearbyQuerySchema,
  needStatusSchema,
  updateSchema,
} from "./reports.schemas";
import { persistEvidenceImage, uploadEvidenceImage } from "./uploads";

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
    const q = req.query as unknown as { lat: number; lng: number; city: string; radiusMeters: number; categoryKey?: string };
    res.json({ reports: await findNearbyReports(q) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getReport(req.params.id));
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

router.post("/:id/confirm", requireAuth, confirmationLimiter, validateBody(confirmSchema), async (req, res, next) => {
  try {
    res.json(await confirmReport(req.params.id, req.user!.id, req.body.type));
  } catch (err) {
    next(err);
  }
});

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
