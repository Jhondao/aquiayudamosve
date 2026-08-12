import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GuestContactFields } from "../components/GuestContactFields";
import type { Category } from "../types";

const CITIES = ["Cali", "Pereira", "Manizales", "Armenia", "Quibdó"];
const CITY_CENTER: Record<string, [number, number]> = {
  Cali: [3.4516, -76.532],
  Pereira: [4.8087, -75.6906],
  Manizales: [5.0703, -75.5138],
  Armenia: [4.5339, -75.6811],
  Quibdó: [5.6947, -76.6611],
};
const SENSITIVE_KEYS = new Set(["personas_heridas", "personas_vulnerables", "rescate_requerido"]);

export default function NeedHelpPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryKey, setCategoryKey] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    api.getCategories().then((res) => setCategories(res.categories.filter((c) => c.group === "necesidad")));
  }, []);

  const isSensitive = SENSITIVE_KEYS.has(categoryKey);

  async function submit() {
    setError(null);
    if (!categoryKey || !city) {
      setError("Selecciona el tipo de necesidad y la ciudad.");
      return;
    }
    if (!profile && (!email.trim() || !phone.trim())) {
      setError("Agrega tu correo y celular, o inicia sesión.");
      return;
    }
    setSubmitting(true);
    try {
      const label = categories.find((c) => c.key === categoryKey)?.label ?? "Solicitud de ayuda";
      await api.createReport({
        categoryKey,
        title: label,
        description: description.trim() || label,
        city,
        approxLocationText: "Ubicación no especificada",
        lat: CITY_CENTER[city][0],
        lng: CITY_CENTER[city][1],
        ...(profile ? {} : { email: email.trim(), phone: phone.trim() }),
      });
      setSubmitted(true);
      setTimeout(() => navigate("/"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-extrabold">Necesito ayuda</h1>
      <p className="mt-1 text-sm text-slate-400">
        Formulario simplificado. Solo pide lo esencial para que otros puedan ayudarte rápido.
      </p>

      {submitted && (
        <div className="mt-4 rounded-xl bg-safe/20 px-3 py-3 text-sm text-safe">
          Solicitud publicada. Ya aparece en el mapa como "Sin verificar" — la comunidad puede confirmarla.
        </div>
      )}

      <label className="mt-4 block text-xs font-semibold text-slate-400">Tipo de necesidad</label>
      <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
        <option value="">Selecciona…</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-xs font-semibold text-slate-400">Ciudad</label>
      <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
        <option value="">Selecciona…</option>
        {CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {isSensitive && (
        <div className="mt-3 rounded-xl border border-danger px-3 py-2 text-xs text-danger">
          Evita incluir nombres, edades exactas o direcciones muy precisas de personas vulnerables.
        </div>
      )}

      <label className="mt-4 block text-xs font-semibold text-slate-400">Describe brevemente la situación</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ej: familia de 4 personas sin agua desde ayer"
        className="mt-1 min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />

      {!profile && <GuestContactFields email={email} setEmail={setEmail} phone={phone} setPhone={setPhone} />}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-5 h-12 w-full rounded-xl bg-danger text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Enviando…" : "ENVIAR SOLICITUD"}
      </button>
    </div>
  );
}
