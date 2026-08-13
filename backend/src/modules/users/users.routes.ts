import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { getPublicProfile } from "../auth/auth.service";

const router = Router();

router.get("/me/reports", requireAuth, async (req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      where: { createdById: req.user!.id, deletedAt: null },
      select: { id: true, title: true, departmentName: true, municipalityName: true, status: true, trustScore: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ profile: await getPublicProfile(req.user!.id), reports });
  } catch (err) {
    next(err);
  }
});

export default router;
