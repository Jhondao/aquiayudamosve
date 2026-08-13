import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { MapView } from "../components/MapView";
import { ReportCard } from "../components/ReportCard";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import type { CategoryGroup, Report } from "../types";
import { useAuth } from "../context/AuthContext";
import { PushToggle } from "../components/PushToggle";

// ACTUALIZACIÓN DEL PROMPT MAESTRO — zonas prioritarias del terremoto del 10
// de agosto (sección 2 del documento), accesos rápidos, no una lista cerrada
// de cobertura: cualquier otro departamento/municipio se puede elegir con
// los selects de abajo o queda igual visible sin filtro.
const PRIORITY_ZONES = [
  { municipality: "Cali", department: "Valle del Cauca" },
  { municipality: "Pereira", department: "Risaralda" },
  { municipality: "Manizales", department: "Caldas" },
  { municipality: "Armenia", department: "Quindío" },
  { municipality: "Quibdó", department: "Chocó" },
  { municipality: "Popayán", department: "Cauca" },
];

const GROUP_FILTERS: { key: CategoryGroup | "todos" | "institucional"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ayuda", label: "Ayuda" },
  { key: "necesidad", label: "Necesidades" },
  { key: "critico", label: "Riesgos" },
  { key: "institucional", label: "Institucional" },
];

const NEED_ICONS: Record<string, string> = {
  falta_agua: "💧",
  falta_alimentos: "🍚",
  necesidad_medicamentos: "💊",
  necesidad_refugio: "🏠",
  personas_heridas: "🚑",
  personas_vulnerables: "🧑‍🤝‍🧑",
  rescate_requerido: "🚨",
  necesidad_transporte: "🚚",
};

function severityFor(count: number): { label: string; className: string } {
  if (count >= 3) return { label: "CRÍTICA", className: "bg-danger/20 text-danger" };
  return { label: "ALTA", className: "bg-warn/20 text-warn" };
}

const HELP_ACTIONS = [
  { icon: "📦", label: "Donaciones", categoryKey: "centro_acopio", hint: "Dónde llevar insumos" },
  { icon: "🚚", label: "Transporte", categoryKey: "necesidad_transporte", hint: "Dónde se necesita mover ayuda" },
  { icon: "🤝", label: "Voluntariado", categoryKey: "voluntarios", hint: "Dónde se necesitan manos" },
];

export default function HomePage() {
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingNearMe, setLocatingNearMe] = useState(false);
  const [filter, setFilter] = useState<(typeof GROUP_FILTERS)[number]["key"]>("todos");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { profile } = useAuth();

  const comoAyudarRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (nearMe) {
        const res = await api.getNearby({ lat: nearMe.lat, lng: nearMe.lng, radiusMeters: 20_000 });
        setAllReports(res.reports);
      } else {
        const res = await api.getReports({
          departmentName: department || undefined,
          municipalityName: municipality || undefined,
          pageSize: 50,
        });
        setAllReports(res.reports);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, municipality, nearMe]);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === department)?.municipalities ?? [];

  function useNearMeFilter() {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocatingNearMe(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingNearMe(false);
        setDepartment("");
        setMunicipality("");
        setNearMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocatingNearMe(false);
        setError("No se pudo obtener tu ubicación.");
      }
    );
  }

  function selectZone(dep: string, mun: string) {
    setNearMe(null);
    setDepartment(dep);
    setMunicipality(mun);
  }

  function clearTerritory() {
    setNearMe(null);
    setDepartment("");
    setMunicipality("");
  }

  const stats = useMemo(() => {
    const centrosAcopio = allReports.filter((r) => r.category.key === "centro_acopio").length;
    const albergues = allReports.filter((r) => r.category.key === "refugio").length;
    const necesidades = allReports.filter((r) => r.category.group === "necesidad").length;
    const transporte = allReports.filter((r) => r.category.key === "necesidad_transporte").length;
    return { centrosAcopio, albergues, necesidades, transporte };
  }, [allReports]);

  const questionedCount = useMemo(() => allReports.filter((r) => r.trustLevel === "cuestionada").length, [allReports]);

  const urgentNeeds = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of allReports) {
      if (r.category.group !== "necesidad") continue;
      if (r.needStatus === "cubierto" || r.needStatus === "excedente") continue; // ya no urge
      const entry = counts.get(r.category.key) ?? { label: r.category.label, count: 0 };
      entry.count += 1;
      counts.set(r.category.key, entry);
    }
    return Array.from(counts.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [allReports]);

  // department/municipality/nearMe ya filtraron en el servidor — esto solo
  // acota lo que ya llegó, por grupo/categoría (cambiar de grupo no debería
  // disparar otro fetch).
  const filteredReports = useMemo(() => {
    return allReports.filter((r) => {
      if (categoryFilter) return r.category.key === categoryFilter;
      if (filter === "institucional") return !!r.organization;
      if (filter !== "todos") return r.category.group === filter;
      return true;
    });
  }, [allReports, filter, categoryFilter]);

  function goToList(key: string | null) {
    setCategoryFilter(key);
    setFilter("todos");
    listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleConfirm(id: string) {
    if (!profile) return navigate("/login");
    try {
      const updated = await api.confirmReport(id, "confirm");
      setAllReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Hero */}
      <h1 className="text-3xl font-extrabold tracking-tight">Ayuda donde más hace falta.</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Coordinamos información sobre centros de acopio, albergues y necesidades de comunidades en toda Colombia —
        con prioridad en las zonas afectadas por el terremoto del 10 de agosto de 2026.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => comoAyudarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="h-12 flex-1 rounded-xl bg-accent px-5 text-sm font-bold text-white"
        >
          Quiero ayudar
        </button>
        <button
          onClick={() => mapaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="h-12 flex-1 rounded-xl bg-danger px-5 text-sm font-bold text-white"
        >
          Necesito ayuda
        </button>
      </div>

      <div className="mt-3">
        <PushToggle />
      </div>

      {questionedCount > 0 && (
        <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-xs font-semibold text-danger">
          {questionedCount} reporte{questionedCount === 1 ? "" : "s"} marcado{questionedCount === 1 ? "" : "s"} como
          incorrecto{questionedCount === 1 ? "" : "s"} por la comunidad — revisa antes de confiar en{" "}
          {questionedCount === 1 ? "él" : "ellos"}.
        </p>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Situación actual */}
      <h2 className="mt-8 text-xs font-bold uppercase tracking-wide text-slate-400">
        Situación actual{municipality ? ` — ${municipality}` : nearMe ? " — cerca de ti" : ""}
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-lg font-extrabold">📦 {stats.centrosAcopio}</div>
          <div className="text-xs text-slate-400">Centros de acopio</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-lg font-extrabold">🏠 {stats.albergues}</div>
          <div className="text-xs text-slate-400">Albergues</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-lg font-extrabold">🆘 {stats.necesidades}</div>
          <div className="text-xs text-slate-400">Necesidades registradas</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-lg font-extrabold">🚚 {stats.transporte}</div>
          <div className="text-xs text-slate-400">Solicitudes de transporte</div>
        </div>
      </div>

      {/* Mapa */}
      <div ref={mapaRef} className="mt-8 scroll-mt-20">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">¿Dónde se necesita ayuda?</h2>
        <div className="mt-2">
          <MapView reports={filteredReports} onSelect={(id) => navigate(`/reporte/${id}`)} />
        </div>
      </div>

      {/* Necesidades urgentes */}
      {urgentNeeds.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Necesidades urgentes</h2>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
            {urgentNeeds.map((n) => {
              const sev = severityFor(n.count);
              return (
                <button
                  key={n.key}
                  onClick={() => goToList(n.key)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-surface2"
                >
                  <span>
                    {NEED_ICONS[n.key] ?? "❗"} {n.label}{" "}
                    <span className="text-xs text-slate-400">({n.count})</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${sev.className}`}>{sev.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cómo puedes ayudar */}
      <div ref={comoAyudarRef} className="mt-8 scroll-mt-20">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">¿Cómo puedes ayudar?</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {HELP_ACTIONS.map((a) => (
            <button
              key={a.categoryKey}
              onClick={() => goToList(a.categoryKey)}
              className="rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface2"
            >
              <div className="text-lg">{a.icon}</div>
              <div className="text-sm font-bold">{a.label}</div>
              <div className="text-xs text-slate-400">{a.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Lista completa */}
      <div ref={listaRef} className="mt-8 scroll-mt-20">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Todos los reportes</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={useNearMeFilter}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              nearMe ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
            }`}
          >
            {locatingNearMe ? "Ubicando…" : "📍 Cerca de mí"}
          </button>
          {PRIORITY_ZONES.map((z) => (
            <button
              key={z.municipality}
              onClick={() => selectZone(z.department, z.municipality)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                municipality === z.municipality && department === z.department
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-surface text-slate-200"
              }`}
            >
              {z.municipality}
            </button>
          ))}
          {(department || municipality || nearMe) && (
            <button onClick={clearTerritory} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-slate-400">
              Todo el país ✕
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={department}
            onChange={(e) => {
              setNearMe(null);
              setDepartment(e.target.value);
              setMunicipality("");
            }}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm sm:w-56"
          >
            <option value="">Departamento…</option>
            {COLOMBIA_LOCATIONS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={municipality}
            onChange={(e) => {
              setNearMe(null);
              setMunicipality(e.target.value);
            }}
            disabled={!department}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm disabled:opacity-50 sm:w-56"
          >
            <option value="">Municipio…</option>
            {municipalityOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => navigate("/necesito-ayuda")}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-base font-extrabold tracking-wide text-white shadow-lg shadow-danger/30 transition active:scale-[0.98] sm:h-12 sm:text-sm"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z" />
            </svg>
            PEDIR AYUDA
          </button>
          <button
            onClick={() => navigate("/reportar")}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-extrabold tracking-wide text-white shadow-lg shadow-accent/30 transition active:scale-[0.98] sm:h-12 sm:text-sm"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c4-4.5 7-8.14 7-11.5A7 7 0 0 0 5 9.5C5 12.86 8 16.5 12 21Z" />
              <circle cx="12" cy="9.5" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            REPORTAR UN PUNTO
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {GROUP_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setCategoryFilter(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                filter === f.key && !categoryFilter
                  ? "border-white bg-white text-ink"
                  : "border-border bg-surface text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
          {categoryFilter && (
            <button
              onClick={() => setCategoryFilter(null)}
              className="rounded-full border border-accent bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent"
            >
              {filteredReports[0]?.category.label ?? categoryFilter} ✕
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {loading && <p className="text-sm text-slate-400">Cargando reportes…</p>}
          {!loading && filteredReports.length === 0 && (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-slate-400">
              No hay reportes que coincidan con este filtro o territorio.
            </p>
          )}
          {filteredReports.map((r) => (
            <ReportCard key={r.id} report={r} onConfirm={handleConfirm} />
          ))}
        </div>
      </div>
    </div>
  );
}
