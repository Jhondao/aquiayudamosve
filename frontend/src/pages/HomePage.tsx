import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { MapView } from "../components/MapView";
import { ReportCard } from "../components/ReportCard";
import type { CategoryGroup, Report } from "../types";
import { useAuth } from "../context/AuthContext";
import { relativeTime } from "../utils/time";

const CITIES = ["Cali", "Pereira", "Manizales", "Armenia", "Quibdó"];
const GROUP_FILTERS: { key: CategoryGroup | "todos" | "institucional"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ayuda", label: "Ayuda" },
  { key: "necesidad", label: "Necesidades" },
  { key: "critico", label: "Riesgos" },
  { key: "institucional", label: "Institucional" },
];

export default function HomePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [city, setCity] = useState<string>("");
  const [filter, setFilter] = useState<(typeof GROUP_FILTERS)[number]["key"]>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReports({
        city: city || undefined,
        group: filter !== "todos" && filter !== "institucional" ? filter : undefined,
        institutional: filter === "institucional",
      });
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, filter]);

  const mapCity = useMemo(() => city || reports[0]?.city, [city, reports]);

  const summary = useMemo(() => {
    if (reports.length === 0) return null;
    const criticalCount = reports.filter((r) => r.category.group === "critico").length;
    const questionedCount = reports.filter((r) => r.trustLevel === "cuestionada").length;
    const urgent = reports
      .filter((r) => r.category.group === "critico" && r.confirmationsCount === 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const lastUpdate = reports.reduce(
      (latest, r) => (new Date(r.lastConfirmedAt) > new Date(latest) ? r.lastConfirmedAt : latest),
      reports[0].lastConfirmedAt
    );
    return { total: reports.length, criticalCount, questionedCount, urgent, lastUpdate };
  }, [reports]);

  async function handleConfirm(id: string) {
    if (!profile) return navigate("/login");
    try {
      const updated = await api.confirmReport(id, "confirm");
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4">
      <h1 className="text-2xl font-extrabold tracking-tight">¿Qué necesitas saber ahora?</h1>
      <p className="mt-1 text-sm text-slate-400">
        Información comunitaria sobre el terremoto del 10 de agosto en Cali, Pereira, Manizales, Armenia y Quibdó.
      </p>

      {summary && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-400">
            {summary.total} reporte{summary.total === 1 ? "" : "s"} activo{summary.total === 1 ? "" : "s"}
            {city ? ` en ${city}` : ""} · {summary.criticalCount} crítico{summary.criticalCount === 1 ? "" : "s"} · última
            actualización {relativeTime(summary.lastUpdate)}
          </p>
          {summary.questionedCount > 0 && (
            <p className="rounded-lg bg-danger/20 px-3 py-2 text-xs font-semibold text-danger">
              {summary.questionedCount} reporte{summary.questionedCount === 1 ? "" : "s"} marcado
              {summary.questionedCount === 1 ? "" : "s"} como incorrecto{summary.questionedCount === 1 ? "" : "s"} por la
              comunidad — revisa antes de confiar en {summary.questionedCount === 1 ? "él" : "ellos"}.
            </p>
          )}
          {summary.urgent && (
            <button
              onClick={() => navigate(`/reporte/${summary.urgent!.id}`)}
              className="block w-full rounded-lg border border-danger bg-danger/10 px-3 py-2 text-left text-xs"
            >
              <span className="font-bold text-danger">MÁS URGENTE SIN CONFIRMAR: </span>
              <span className="text-slate-200">
                {summary.urgent.title}
                {summary.urgent.approxLocationText && summary.urgent.approxLocationText !== summary.urgent.title
                  ? ` · ${summary.urgent.approxLocationText}`
                  : ""}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
          className="h-11 flex-1 rounded-xl bg-danger px-4 text-sm font-bold text-white"
        >
          NECESITO AYUDA
        </button>
        <button
          onClick={() => navigate("/reportar")}
          className="h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-bold text-white"
        >
          QUIERO REPORTAR
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {GROUP_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === f.key ? "border-white bg-white text-ink" : "border-border bg-surface text-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
        <div className="lg:sticky lg:top-20 lg:w-[420px] lg:flex-none">
          <MapView reports={reports} city={mapCity} onSelect={(id) => navigate(`/reporte/${id}`)} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {loading && <p className="text-sm text-slate-400">Cargando reportes…</p>}
          {!loading && reports.length === 0 && (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-slate-400">
              No hay reportes que coincidan con este filtro o ciudad.
            </p>
          )}
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} onConfirm={handleConfirm} />
          ))}
        </div>
      </div>
    </div>
  );
}
