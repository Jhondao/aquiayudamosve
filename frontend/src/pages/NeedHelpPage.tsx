import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GuestContactFields } from "../components/GuestContactFields";
import { EMPTY_LOCATION, LocationSelector } from "../components/LocationSelector";
import type { Category } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const SENSITIVE_KEYS = new Set(["personas_heridas", "personas_vulnerables", "rescate_requerido"]);

export default function NeedHelpPage() {
  useDocumentTitle("Necesito ayuda");

  const { profile } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryKey, setCategoryKey] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantityNeeded, setQuantityNeeded] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");

  useEffect(() => {
    api.getCategories().then((res) => setCategories(res.categories.filter((c) => c.group === "necesidad")));
  }, []);

  const isSensitive = SENSITIVE_KEYS.has(categoryKey);

  async function submit() {
    setError(null);
    if (!categoryKey || !location.departmentName.trim() || !location.municipalityName.trim() || location.lat == null || location.lng == null) {
      setError("Selecciona el tipo de necesidad y marca dónde, incluyendo el punto en el mapa.");
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
        departmentName: location.departmentName.trim(),
        municipalityName: location.municipalityName.trim(),
        localityName: location.localityName.trim() || undefined,
        locationSource: location.locationSource ?? "manual",
        approxLocationText: location.approxLocationText.trim() || undefined,
        lat: location.lat,
        lng: location.lng,
        ...(quantityNeeded.trim() ? { quantityNeeded: Number(quantityNeeded), quantityUnit: quantityUnit.trim() || undefined } : {}),
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

      <div className="mt-4 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400">Cantidad necesaria (opcional)</label>
          <input
            type="number"
            min="0"
            value={quantityNeeded}
            onChange={(e) => setQuantityNeeded(e.target.value)}
            placeholder="Ej: 500"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="w-28">
          <label className="block text-xs font-semibold text-slate-400">Unidad</label>
          <input
            value={quantityUnit}
            onChange={(e) => setQuantityUnit(e.target.value)}
            placeholder="L, kg…"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-4">
        <LocationSelector value={location} onChange={setLocation} />
      </div>

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
