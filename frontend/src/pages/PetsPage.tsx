import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { PetCard } from "../components/PetCard";
import { PetMapLayer } from "../components/PetMapLayer";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import type { PetReport, PetReportType } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const TYPE_FILTERS: { key: PetReportType | "todos"; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "lost", label: "Perdidas" },
  { key: "found", label: "Encontradas" },
  { key: "needs_help", label: "Necesitan ayuda" },
];

export default function PetsPage() {
  useDocumentTitle("Mascotas perdidas y encontradas");

  const navigate = useNavigate();
  const [pets, setPets] = useState<PetReport[]>([]);
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [filter, setFilter] = useState<(typeof TYPE_FILTERS)[number]["key"]>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPetReports({
        departmentName: department || undefined,
        municipalityName: municipality || undefined,
        reportType: filter === "todos" ? undefined : filter,
        pageSize: 60,
      });
      setPets(res.pets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las mascotas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, municipality, filter]);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === department)?.municipalities ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <button
        onClick={() => navigate("/")}
        className="mb-2 inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-3 text-sm font-semibold text-slate-200 hover:bg-surface2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
        Volver al inicio
      </button>
      <h1 className="text-3xl font-extrabold tracking-tight">🐾 Mascotas perdidas y encontradas</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Ayúdanos a reunir mascotas con sus familias. Reportar toma menos de un minuto — sin necesidad de cuenta.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => navigate("/mascotas/reportar?type=lost")}
          className="h-14 flex-1 rounded-xl bg-danger px-4 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-danger/30 active:scale-[0.98]"
        >
          PERDÍ MI MASCOTA
        </button>
        <button
          onClick={() => navigate("/mascotas/reportar?type=found")}
          className="h-14 flex-1 rounded-xl bg-safe px-4 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-safe/30 active:scale-[0.98]"
        >
          ENCONTRÉ UNA MASCOTA
        </button>
        <button
          onClick={() => navigate("/mascotas/reportar?type=needs_help")}
          className="h-14 flex-1 rounded-xl bg-warn px-4 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-warn/30 active:scale-[0.98]"
        >
          NECESITA AYUDA
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-8">
        <PetMapLayer pets={pets} onSelect={(id) => navigate(`/mascotas/${id}`)} />
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <select
          value={department}
          onChange={(e) => {
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
          onChange={(e) => setMunicipality(e.target.value)}
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
        {(department || municipality) && (
          <button
            onClick={() => {
              setDepartment("");
              setMunicipality("");
            }}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-slate-400"
          >
            Todo el país ✕
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
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

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="text-sm text-slate-400">Cargando…</p>}
        {!loading && pets.length === 0 && (
          <p className="col-span-full rounded-xl border border-border bg-surface p-6 text-center text-sm text-slate-400">
            No hay mascotas reportadas con este filtro o territorio.
          </p>
        )}
        {pets.map((p) => (
          <PetCard key={p.id} pet={p} />
        ))}
      </div>
    </div>
  );
}
