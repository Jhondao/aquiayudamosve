import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GuestContactFields } from "../components/GuestContactFields";
import { EMPTY_LOCATION, LocationSelector } from "../components/LocationSelector";
import type { Category, Report } from "../types";

const SENSITIVE_KEYS = new Set(["personas_heridas", "personas_vulnerables", "rescate_requerido"]);

export default function ReportFormPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [group, setGroup] = useState<"ayuda" | "necesidad" | "critico" | "info">("ayuda");
  const [categoryKey, setCategoryKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [nearby, setNearby] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantityNeeded, setQuantityNeeded] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");

  useEffect(() => {
    api.getCategories().then((res) => setCategories(res.categories));
  }, []);

  const subOptions = useMemo(() => categories.filter((c) => c.group === group), [categories, group]);
  const isSensitive = SENSITIVE_KEYS.has(categoryKey);

  useEffect(() => {
    if (location.lat == null || location.lng == null || !categoryKey) {
      setNearby([]);
      return;
    }
    api
      .getNearby({ lat: location.lat, lng: location.lng, categoryKey, radiusMeters: 300 })
      .then((res) => setNearby(res.reports))
      .catch(() => setNearby([]));
  }, [location.lat, location.lng, categoryKey]);

  async function submit() {
    setError(null);
    if (!categoryKey || !title.trim() || !description.trim() || !location.departmentName.trim() || !location.municipalityName.trim() || location.lat == null || location.lng == null) {
      setError("Completa todos los campos obligatorios, incluyendo el punto en el mapa.");
      return;
    }
    if (!profile && (!email.trim() || !phone.trim())) {
      setError("Agrega tu correo y celular, o inicia sesión.");
      return;
    }
    setSubmitting(true);
    try {
      const report = await api.createReport({
        categoryKey,
        title,
        description,
        departmentName: location.departmentName.trim(),
        municipalityName: location.municipalityName.trim(),
        localityName: location.localityName.trim() || undefined,
        locationSource: location.locationSource ?? "manual",
        approxLocationText: location.approxLocationText.trim() || undefined,
        lat: location.lat,
        lng: location.lng,
        ...(group === "necesidad" && quantityNeeded.trim()
          ? { quantityNeeded: Number(quantityNeeded), quantityUnit: quantityUnit.trim() || undefined }
          : {}),
        ...(profile ? {} : { email: email.trim(), phone: phone.trim() }),
      });
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

      {group === "necesidad" && (
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

      <div className="mt-4">
        <LocationSelector value={location} onChange={setLocation} />
      </div>

      {nearby.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface p-3">
          <p className="text-xs text-slate-300">Ya existen reportes similares cerca:</p>
          {nearby.slice(0, 3).map((r) => (
            <div key={r.id} className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-sm">
              <span className="flex-1">{r.title}</span>
              <button
                onClick={async () => {
                  if (profile) await api.confirmReport(r.id, "confirm").catch(() => undefined);
                  navigate(`/reporte/${r.id}`);
                }}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold"
              >
                {profile ? "CONFIRMAR EXISTENTE" : "VER REPORTE"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!profile && <GuestContactFields email={email} setEmail={setEmail} phone={phone} setPhone={setPhone} />}

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
