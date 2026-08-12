import { useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  // Se precargan en el useEffect para que enable() no tenga que hacer
  // ningún await de red antes de llamar a subscribe() — Safari/iOS cancela
  // en silencio el permiso si pasa demasiado tiempo desde el toque del
  // usuario hasta la llamada real a pushManager.subscribe().
  const publicKeyRef = useRef<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      let publicKey: string;
      try {
        publicKey = (await api.getPushPublicKey()).publicKey;
      } catch {
        setStatus("unavailable"); // backend no tiene VAPID configurado todavía
        return;
      }
      publicKeyRef.current = publicKey;

      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      registrationRef.current = registration;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    }
    check().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (!registrationRef.current || !publicKeyRef.current) {
        throw new Error("Todavía cargando — espera un segundo e intenta de nuevo.");
      }
      // Primer await: directo a subscribe(), sin nada de red antes.
      const subscription = await registrationRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyRef.current),
      });
      await api.pushSubscribe(subscription.toJSON() as never);
      setStatus("on");
    } catch (err) {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo activar. Intenta de nuevo.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = registrationRef.current ?? (await navigator.serviceWorker.ready);
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
        quieres recibir avisos de puntos críticos y necesidades nuevas.
      </p>
    );
  }

  return (
    <div>
      {status === "on" && <p className="mb-1.5 text-xs text-safe">✅ Avisos de puntos críticos y necesidades activados</p>}
      <button
        onClick={() => (status === "on" ? disable() : enable())}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
          status === "on"
            ? "border-border bg-surface text-slate-400 hover:bg-surface2"
            : "border-border bg-surface text-slate-200 hover:bg-surface2"
        }`}
      >
        {status === "on" ? "🔕 Desactivar avisos" : "🔔 Avisar de críticos y necesidades nuevas"}
      </button>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
