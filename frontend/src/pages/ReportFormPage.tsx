import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Category, Report } from "../types";

const CITIES = ["Cali", "Pereira", "Manizales", "Armenia", "Quibdó"];
const CITY_CENTER: Record<string, [number, number]> = {
  Cali: [3.4516, -76.532],
  Pereira: [4.8087, -75.6906],
  Manizales: [5.0703, -75.5138],
  Armenia: [4.5339, -75.6811],
  Quibdó: [5.6947, -76.6611],
};
const SENSITIVE_KEYS = new Set(["personas_heridas", "personas_vulnerables", "rescate_requerido"]);

export default function ReportFormPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [group, setGroup] = useState<"ayuda" | "necesidad" | "critico" | "info">("ayuda");
  const [categoryKey, setCategoryKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [locationText, setLocationText] = useState("");
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [nearby, setNearby] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getCategories().then((res) => setCategories(res.categories));
  }, []);

  const subOptions = useMemo(() => categories.filter((c) => c.group === group), [categories, group]);
  const isSensitive = SENSITIVE_KEYS.has(categoryKey);

  useEffect(() => {
    if (!city || !categoryKey) {
      setNearby([]);
      return;
    }
    const [lat, lng] = coords ?? CITY_CENTER[city];
    api
      .getNearby({ lat, lng, city, categoryKey, radiusMeters: 300 })
      .then((res) => setNearby(res.reports))
      .catch(() => setNearby([]));
  }, [city, categoryKey, coords]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords([pos.coords.latitude, pos.coords.longitude]),
      () => setError("No se pudo obtener tu ubicación. Puedes seguir sin ella.")
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-slate-400">Debes iniciar sesión para publicar un reporte.</p>
        <button onClick={() => navigate("/login")} className="mt-3 rounded-xl bg-accent px-5 py-2 font-bold text-white">
          Ingresar
        </button>
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (!categoryKey || !title.trim() || !description.trim() || !city || !locationText.trim()) {
      setError("Completa todos los campos obligatorios.");
      return;
    }
    setSubmitting(true);
    try {
      const [lat, lng] = coords ?? CITY_CENTER[city];
      const report = await api.createReport({ categoryKey, title, description, city, approxLocationText: locationText, lat, lng });
      navigate(`/reporte/${report.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el reporte.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-extrabold">Quiero reportar</h1>
      <p className="mt-1 text-sm text-slate-400">
        Toda la información se muestra como "Sin verificar" hasta que la comunidad la confirme.
      </p>

      <div className="mt-4 flex overflow-hidden rounded-xl border border-border">
        {(["ayuda", "critico", "info"] as const).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroup(g);
              setCategoryKey("");
            }}
            className={`flex-1 py-2.5 text-sm font-semibold ${group === g ? "bg-white text-ink" : "bg-surface text-slate-200"}`}
          >
            {g === "ayuda" ? "Ayuda" : g === "critico" ? "Punto crítico" : "Información"}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          setGroup("necesidad");
          setCategoryKey("");
        }}
        className={`mt-2 w-full rounded-xl border py-2.5 text-sm font-semibold ${
          group === "necesidad" ? "border-white bg-white text-ink" : "border-border bg-surface text-slate-200"
        }`}
      >
        Necesidad de ayuda
      </button>

      <label className="mt-4 block text-xs font-semibold text-slate-400">Subcategoría</label>
      <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
        <option value="">Selecciona…</option>
        {subOptions.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      {isSensitive && (
        <div className="mt-3 rounded-xl border border-danger px-3 py-2 text-xs text-danger">
          Esta categoría puede involucrar personas vulnerables. Evita incluir nombres, edades exactas o direcciones muy
          precisas — reduciremos la precisión de la ubicación automáticamente.
        </div>
      )}

      <label className="mt-4 block text-xs font-semibold text-slate-400">Título</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ej: Agua potable disponible"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-400">Descripción breve</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Detalles útiles y verificables"
        className="mt-1 min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-400">Ciudad</label>
      <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
        <option value="">Selecciona…</option>
        {CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-xs font-semibold text-slate-400">Ubicación aproximada (barrio, vía, referencia)</label>
      <input
        value={locationText}
        onChange={(e) => setLocationText(e.target.value)}
        placeholder="Ej: cerca al Parque de la Vida"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
      <button onClick={useMyLocation} className="mt-2 text-xs font-semibold text-accent underline">
        Usar mi ubicación actual (aproximada)
      </button>

      {nearby.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface p-3">
          <p className="text-xs text-slate-300">Ya existen reportes similares cerca:</p>
          {nearby.slice(0, 3).map((r) => (
            <div key={r.id} className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-sm">
              <span className="flex-1">{r.title}</span>
              <button
                onClick={async () => {
                  await api.confirmReport(r.id, "confirm");
                  navigate(`/reporte/${r.id}`);
                }}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold"
              >
                CONFIRMAR EXISTENTE
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-5 h-12 w-full rounded-xl bg-accent text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Publicando…" : "PUBLICAR REPORTE"}
      </button>
    </div>
  );
}
