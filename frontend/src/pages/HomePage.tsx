import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { MapView } from "../components/MapView";
import { ReportCard } from "../components/ReportCard";
import type { CategoryGroup, Report } from "../types";
import { useAuth } from "../context/AuthContext";
import { PushToggle } from "../components/PushToggle";

// Cerrado a Cali por ahora — se reabre agregando las demás ciudades aquí.
const CITIES = ["Cali"];
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
  const [city, setCity] = useState<string>("");
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
      const res = await api.getReports({});
      setAllReports(res.reports);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const mapCity = useMemo(() => city || allReports[0]?.city, [city, allReports]);

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
      const entry = counts.get(r.category.key) ?? { label: r.category.label, count: 0 };
      entry.count += 1;
      counts.set(r.category.key, entry);
    }
    return Array.from(counts.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [allReports]);

  const filteredReports = useMemo(() => {
    return allReports.filter((r) => {
      if (city && r.city !== city) return false;
      if (categoryFilter) return r.category.key === categoryFilter;
      if (filter === "institucional") return !!r.organization;
      if (filter !== "todos") return r.category.group === filter;
      return true;
    });
  }, [allReports, city, filter, categoryFilter]);

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
        Coordinamos información sobre centros de acopio, albergues y necesidades de las comunidades afectadas por el
        terremoto del 10 de agosto de 2026.
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
      <h2 className="mt-8 text-xs font-bold uppercase tracking-wide text-slate-400">Situación actual</h2>
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
          <MapView reports={filteredReports} city={mapCity} onSelect={(id) => navigate(`/reporte/${id}`)} />
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

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">Todas las ciudades</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
              No hay reportes que coincidan con este filtro o ciudad.
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
