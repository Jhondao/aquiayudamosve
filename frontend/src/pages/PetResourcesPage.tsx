import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import { PET_RESOURCE_CATEGORY_META } from "../components/petStatusStyle";
import type { PetResource, PetResourceCategory } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const CATEGORY_FILTERS: { key: PetResourceCategory | "todos"; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "veterinary", label: "Veterinaria" },
  { key: "transport", label: "Transporte" },
  { key: "temporary_home", label: "Hogar temporal" },
  { key: "attention_point", label: "Punto de atención" },
  { key: "rescue", label: "Rescate" },
];

export default function PetResourcesPage() {
  useDocumentTitle("Quiero ayudar con mascotas");

  const navigate = useNavigate();
  const { profile } = useAuth();
  const [resources, setResources] = useState<PetResource[]>([]);
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]["key"]>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPetResources({
        departmentName: department || undefined,
        municipalityName: municipality || undefined,
        category: category === "todos" ? undefined : category,
        pageSize: 60,
      });
      setResources(res.resources);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los recursos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, municipality, category]);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === department)?.municipalities ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">🤝 Quiero ayudar con mascotas</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Directorio comunitario de veterinarios, transporte, hogares temporales y puntos de atención para mascotas en
        emergencia.
      </p>

      {profile ? (
        <button
          onClick={() => navigate("/mascotas/ayudar/nuevo")}
          className="mt-4 h-12 w-full rounded-xl bg-accent px-4 text-sm font-bold text-white sm:w-auto sm:px-8"
        >
          + Ofrecer ayuda
        </button>
      ) : (
        <button
          onClick={() => navigate("/login")}
          className="mt-4 h-12 w-full rounded-xl border border-border text-sm font-semibold sm:w-auto sm:px-8"
        >
          Inicia sesión para ofrecer ayuda
        </button>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

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
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setCategory(f.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              category === f.key ? "border-white bg-white text-ink" : "border-border bg-surface text-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="text-sm text-slate-400">Cargando…</p>}
        {!loading && resources.length === 0 && (
          <p className="col-span-full rounded-xl border border-border bg-surface p-6 text-center text-sm text-slate-400">
            No hay recursos registrados con este filtro o territorio todavía.
          </p>
        )}
        {resources.map((r) => {
          const meta = PET_RESOURCE_CATEGORY_META[r.category];
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <span className="w-fit rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                {meta.emoji} {meta.label}
              </span>
              <p className="text-base font-bold">{r.name}</p>
              <p className="text-xs text-slate-400">{r.municipalityName}, {r.departmentName}</p>
              <p className="text-sm">{r.description}</p>
              {r.availabilityNote && <p className="text-xs text-slate-400">🕒 {r.availabilityNote}</p>}
              <div className="mt-1 border-t border-border pt-2 text-xs">
                <p className="font-semibold">{r.contactName}</p>
                {r.contactEmail && (
                  <a href={`mailto:${r.contactEmail}`} className="block text-accent underline">
                    {r.contactEmail}
                  </a>
                )}
                {r.contactPhone && (
                  <a href={`tel:${r.contactPhone}`} className="block text-accent underline">
                    {r.contactPhone}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
