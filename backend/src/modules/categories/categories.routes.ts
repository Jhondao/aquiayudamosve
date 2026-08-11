import { Router } from "express";
import { prisma } from "../../lib/prisma";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const categories = await prisma.reportCategory.findMany({
      where: { active: true },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

export default router;
