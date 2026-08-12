import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validate";
import { env } from "../../config/env";
import { subscribeSchema, unsubscribeSchema } from "./push.schemas";

const router = Router();

// La llave pública no es un secreto — es literalmente para eso, se manda al
// navegador. Sin auth: activar avisos no requiere cuenta (igual que reportar).
router.get("/vapid-public-key", (_req, res) => {
  if (!env.vapidPublicKey) return res.status(404).json({ error: "Notificaciones push no configuradas." });
  res.json({ publicKey: env.vapidPublicKey });
});

router.post("/subscribe", validateBody(subscribeSchema), async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/unsubscribe", validateBody(unsubscribeSchema), async (req, res, next) => {
  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
