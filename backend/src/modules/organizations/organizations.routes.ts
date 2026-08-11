import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true, verified: true },
      orderBy: { name: "asc" },
    });
    res.json({ organizations });
  } catch (err) {
    next(err);
  }
});

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(150),
  type: z.string().trim().min(2).max(80),
});

// Registering an org record is admin-only in this MVP — self-service org
// signup (with document verification) is explicitly out of scope for the MVP
// per section 30 ("no solicitar documentos de identidad... durante el MVP").
router.post("/", requireAuth, requireRole("admin"), validateBody(createOrgSchema), async (req, res, next) => {
  try {
    const org = await prisma.organization.create({ data: req.body });
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "organization.create", entityType: "organization", entityId: org.id },
    });
    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/verify", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const org = await prisma.organization.update({ where: { id: req.params.id }, data: { verified: true } });
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "organization.verify", entityType: "organization", entityId: org.id },
    });
    res.json(org);
  } catch (err) {
    next(err);
  }
});

export default router;
