import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PetStatusBadge } from "../components/PetStatusBadge";
import { PET_HELP_CATEGORY_LABEL, PET_REPORT_TYPE_LABEL, PET_SPECIES_META, PET_STATUS_META } from "../components/petStatusStyle";
import { PetShareSheet } from "../components/PetShareSheet";
import { relativeTime } from "../utils/time";
import type { PetReport, PetStatus } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// possible_match queda fuera del selector a propósito — es un concepto de
// Fase 2 (sugerencias automáticas de coincidencia) que ningún flujo de Fase
// 1 produce ni consume todavía; el valor del enum ya existe en el backend
// para no necesitar una migración nueva cuando llegue esa fase.
const PET_STATUS_OPTIONS: PetStatus[] = ["lost", "sighted", "sheltered", "found", "needs_help", "reunited", "closed", "outdated"];

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pet, setPet] = useState<PetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusInput, setStatusInput] = useState<PetStatus>("lost");
  const [note, setNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useDocumentTitle(pet?.name ?? "Detalle de mascota");

  async function load() {
    if (!id) return;
    try {
      const res = await api.getPetReport(id);
      setPet(res);
      setStatusInput(res.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitStatus() {
    if (!pet) return;
    setError(null);
    setUpdating(true);
    try {
      const updated = await api.updatePetStatus(pet.id, { status: statusInput, note: note.trim() || undefined });
      setPet(updated);
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el estado.");
    } finally {
      setUpdating(false);
    }
  }

  if (error && !pet) {
    return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-danger">{error}</p>;
  }
  if (!pet) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-slate-400">Cargando…</p>;

  const species = PET_SPECIES_META[pet.species];
  const isReunited = pet.status === "reunited";

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        onClick={() => navigate("/mascotas")}
        className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-3 text-sm font-semibold text-slate-200 hover:bg-surface2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
        Volver a mascotas
      </button>

      {isReunited && (
        <div className="mt-3 rounded-xl border border-safe bg-safe/10 px-3 py-3 text-center text-sm font-bold text-safe">
          🎉 ¡{pet.name ?? "Esta mascota"} ya volvió a casa! Gracias a quienes compartieron y ayudaron.
        </div>
      )}

      {pet.isSheltered && (
        <div className="mt-3 rounded-xl border border-accent px-3 py-2 text-xs text-accent">
          Esta mascota está resguardada — la ubicación exacta se oculta por privacidad.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PetStatusBadge status={pet.status} />
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
          {PET_REPORT_TYPE_LABEL[pet.reportType]}
        </span>
        {pet.isEmergency && (
          <span className="rounded-full border border-danger px-2.5 py-0.5 text-[11px] font-bold text-danger">Urgente</span>
        )}
      </div>

      <h1 className="mt-2 text-xl font-extrabold">
        {species.emoji} {pet.name ?? `${species.label} sin nombre`}
      </h1>
      <p className="text-xs text-slate-400">
        {pet.approxLocationText ?? pet.localityName ?? "Ubicación aproximada"} · {pet.municipalityName}, {pet.departmentName}
      </p>

      {pet.imageUrl && (
        <img src={pet.imageUrl} alt={pet.name ?? species.label} className="mt-3 max-h-80 w-full rounded-xl object-cover" />
      )}

      <p className="mt-3 text-sm">{pet.description}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
        {pet.breed && (
          <div>
            <span className="text-slate-500">Raza:</span> {pet.breed}
          </div>
        )}
        {pet.primaryColor && (
          <div>
            <span className="text-slate-500">Color:</span> {pet.primaryColor}
          </div>
        )}
        {pet.size && (
          <div>
            <span className="text-slate-500">Tamaño:</span> {pet.size === "small" ? "Pequeño" : pet.size === "medium" ? "Mediano" : "Grande"}
          </div>
        )}
        {pet.sex !== "unknown" && (
          <div>
            <span className="text-slate-500">Sexo:</span> {pet.sex === "male" ? "Macho" : "Hembra"}
          </div>
        )}
        {pet.helpCategory && (
          <div>
            <span className="text-slate-500">Ayuda necesaria:</span> {PET_HELP_CATEGORY_LABEL[pet.helpCategory]}
          </div>
        )}
      </div>

      {pet.distinctiveFeatures && (
        <p className="mt-2 text-xs text-slate-400">
          <span className="text-slate-500">Señas particulares:</span> {pet.distinctiveFeatures}
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-500">Última actualización {relativeTime(pet.lastConfirmedAt)}.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setShareOpen(true)}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          COMPARTIR
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Actualizar estado</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Cualquier persona con cuenta puede actualizar el estado — igual que confirmar un reporte. El cambio queda
          registrado para moderación.
        </p>

        {!profile ? (
          <button
            onClick={() => navigate("/login")}
            className="mt-3 h-11 w-full rounded-xl border border-border text-sm font-semibold"
          >
            Inicia sesión para actualizar el estado
          </button>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value as PetStatus)}
                className="h-11 w-full rounded-xl border border-border bg-surface2 px-3 text-sm"
              >
                {PET_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {PET_STATUS_META[s].emoji} {PET_STATUS_META[s].label}
                  </option>
                ))}
              </select>
              <button
                onClick={submitStatus}
                disabled={updating}
                className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {updating ? "Guardando…" : "Actualizar"}
              </button>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="mt-2 h-10 w-full rounded-lg border border-border bg-surface2 px-3 text-sm"
            />
          </>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <PetShareSheet petId={pet.id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
