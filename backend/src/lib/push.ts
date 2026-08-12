import webpush from "web-push";
import { prisma } from "./prisma";
import { env } from "../config/env";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set to send push notifications.");
  }
  webpush.setVapidDetails(env.vapidContact, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
}

export type PushPayload = { title: string; body: string; url?: string };

// Manda a todas las suscripciones activas; una suscripción caducada
// (410/404 — el usuario desinstaló, limpió datos, etc.) se borra sola en
// vez de reintentarse por siempre.
export async function broadcastPush(payload: PushPayload): Promise<void> {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return; // no configurado — no-op silencioso
  ensureConfigured();

  const subscriptions = await prisma.pushSubscription.findMany();
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`push send failed for subscription ${sub.id}:`, err);
        }
      }
    })
  );
}
