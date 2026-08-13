import { useState } from "react";
import { GuestContactFields } from "./GuestContactFields";
import type { GuestContact } from "../context/GuestContactContext";

// Compartido por HomePage (lista) y ReportDetailPage (detalle) — se pide una
// sola vez por visita (ver GuestContactContext); nunca crea una cuenta ni
// pide contraseña, solo resuelve una identidad guest del lado del backend
// (mismo modelo que publicar sin cuenta).
export function GuestConfirmModal({
  open,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (contact: GuestContact, honeypot: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit() {
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setError("Agrega tu nombre y tu correo o celular.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(
        { displayName: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined },
        website
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold">Confirmar sin cuenta</h2>
        <p className="mt-1 text-xs text-slate-400">
          Solo tu nombre y tu correo o celular — no creamos ninguna cuenta ni contraseña. Te lo pedimos una sola vez
          por visita.
        </p>

        <GuestContactFields
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          displayName={name}
          setDisplayName={setName}
          phoneRequired={false}
          compact
          honeypot={{ value: website, setValue: setWebsite }}
        />

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            onClick={onCancel}
            className="h-10 flex-1 rounded-xl border border-border text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 flex-1 rounded-xl bg-accent text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
