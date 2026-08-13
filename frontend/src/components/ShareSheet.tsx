import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ShareCard } from "../types";

export function ShareSheet({ reportId, open, onClose }: { reportId: string; open: boolean; onClose: () => void }) {
  const [card, setCard] = useState<ShareCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCard(null);
    setError(null);
    setNotice(null);
    api
      .getShareCard(reportId)
      .then(setCard)
      .catch(() => setError("No se pudo preparar la pieza para compartir."));
  }, [open, reportId]);

  if (!open) return null;

  function track(channel: "whatsapp" | "web_share" | "copy_link" | "save_image") {
    api.recordShareEvent(reportId, channel).catch(() => {});
  }

  async function shareToWhatsapp() {
    if (!card) return;
    track("whatsapp");
    window.open(`https://wa.me/?text=${encodeURIComponent(card.whatsappText)}`, "_blank", "noopener,noreferrer");
  }

  async function shareNative() {
    if (!card) return;
    track("web_share");
    try {
      if (card.imageUrl && navigator.canShare) {
        const res = await fetch(card.imageUrl);
        const blob = await res.blob();
        const file = new File([blob], "aquiayudamosve.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ text: card.whatsappText, files: [file] });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ text: card.whatsappText, url: card.shareUrl });
        return;
      }
    } catch {
      // Si falla (sin soporte, usuario canceló, CORS del bucket) caemos a WhatsApp.
    }
    shareToWhatsapp();
  }

  async function copyLink() {
    if (!card) return;
    track("copy_link");
    await navigator.clipboard.writeText(card.shareUrl);
    setNotice("Enlace copiado.");
  }

  async function saveImage() {
    if (!card?.imageUrl) return;
    track("save_image");
    const a = document.createElement("a");
    a.href = card.imageUrl;
    a.download = "aquiayudamosve.png";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-border bg-surface p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface2" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Compartir reporte</h2>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {!error && !card && <p className="mt-3 text-sm text-slate-400">Preparando…</p>}

        {card && (
          <>
            {card.imageUrl ? (
              <img src={card.imageUrl} alt="Pieza para compartir" className="mt-3 w-full rounded-xl border border-border" />
            ) : (
              <div className="mt-3 rounded-xl border border-warn px-3 py-2 text-xs text-warn">
                ⚠️ Esta información aún no está confirmada por la comunidad. Se compartirá solo el enlace, con esa
                advertencia incluida.
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={shareToWhatsapp} className="rounded-xl bg-safe px-4 py-3 text-sm font-bold text-white">
                WhatsApp
              </button>
              <button onClick={shareNative} className="rounded-xl border border-border bg-surface2 px-4 py-3 text-sm font-semibold">
                Otra app
              </button>
              <button onClick={copyLink} className="rounded-xl border border-border bg-surface2 px-4 py-3 text-sm font-semibold">
                Copiar enlace
              </button>
              <button
                onClick={saveImage}
                disabled={!card.imageUrl}
                className="rounded-xl border border-border bg-surface2 px-4 py-3 text-sm font-semibold disabled:opacity-40"
              >
                Guardar pieza
              </button>
            </div>

            {notice && <p className="mt-3 text-xs text-safe">{notice}</p>}
          </>
        )}

        <button onClick={onClose} className="mt-4 w-full py-2 text-center text-xs text-slate-400">
          Cerrar
        </button>
      </div>
    </div>
  );
}
