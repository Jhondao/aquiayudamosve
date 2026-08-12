import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Status = "checking" | "unsupported" | "unavailable" | "off" | "on" | "denied";

export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      try {
        await api.getPushPublicKey();
      } catch {
        setStatus("unavailable"); // backend no tiene VAPID configurado todavía
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    }
    check().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const { publicKey } = await api.getPushPublicKey();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.pushSubscribe(subscription.toJSON() as never);
      setStatus(Notification.permission === "denied" ? "denied" : "on");
    } catch (err) {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
      console.error(err instanceof ApiError ? err.message : err);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported" || status === "unavailable") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-slate-500">
        🔕 Bloqueaste las notificaciones de este sitio en tu navegador — actívalas desde la configuración del sitio si
        quieres recibir avisos de puntos críticos nuevos.
      </p>
    );
  }

  return (
    <button
      onClick={() => (status === "on" ? disable() : enable())}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-surface2 disabled:opacity-50"
    >
      {status === "on" ? "🔔 Avisos activados" : "🔔 Avisar de puntos críticos nuevos"}
    </button>
  );
}
