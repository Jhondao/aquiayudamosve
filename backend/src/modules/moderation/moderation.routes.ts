import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { listAuditLog, listFlaggedReports, moderateReport } from "./moderation.service";
import { moderationActionSchema } from "./moderation.schemas";

const router = Router();

router.use(requireAuth, requireRole("moderator", "admin"));

router.get("/reports/flagged", async (_req, res, next) => {
  try {
    res.json({ reports: await listFlaggedReports() });
  } catch (err) {
    next(err);
  }
});

router.patch("/reports/:id", validateBody(moderationActionSchema), async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const report = await moderateReport(req.user!.id, req.params.id, action, reason);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get("/audit-logs", async (_req, res, next) => {
  try {
    res.json({ logs: await listAuditLog() });
  } catch (err) {
    next(err);
  }
});

export default router;
