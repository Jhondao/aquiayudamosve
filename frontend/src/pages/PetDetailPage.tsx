import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useGuestContact, type GuestContact } from "../context/GuestContactContext";
import { GuestConfirmModal } from "../components/GuestConfirmModal";
import { PetStatusBadge } from "../components/PetStatusBadge";
import {
  HELP_TO_RESOURCE_CATEGORY,
  PET_HELP_CATEGORY_LABEL,
  PET_REPORT_TYPE_LABEL,
  PET_RESOURCE_CATEGORY_META,
  PET_SPECIES_META,
  PET_STATUS_META,
} from "../components/petStatusStyle";
import { PetShareSheet } from "../components/PetShareSheet";
import { getRecaptchaToken } from "../utils/recaptcha";
import { relativeTime } from "../utils/time";
import type { PetReport, PetResource, PetSighting, PetStatus, PossibleMatch, RevealedPetContact } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// Fase 2 agrega possible_match a las opciones — Fase 1 lo excluía a
// propósito (nada todavía lo producía/consumía); ahora getPossibleMatches
// sí lo sugiere activamente.
const PET_STATUS_OPTIONS: PetStatus[] = [
  "lost",
  "sighted",
  "sheltered",
  "found",
  "possible_match",
  "needs_help",
  "reunited",
  "closed",
  "outdated",
];

type PendingAction =
  | { kind: "confirm"; type: "confirm" | "incorrect" }
  | { kind: "sighting"; lat?: number; lng?: number; note?: string }
  | { kind: "reveal" };

const RECAPTCHA_ACTION: Record<PendingAction["kind"], string> = {
  confirm: "CONFIRM_PET",
  sighting: "CREATE_PET_SIGHTING",
  reveal: "REVEAL_PET_CONTACT",
};

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { guestContact, rememberGuestContact } = useGuestContact();
  const navigate = useNavigate();
  const [pet, setPet] = useState<PetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusInput, setStatusInput] = useState<PetStatus>("lost");
  const [note, setNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Fase 2
  const [sightings, setSightings] = useState<PetSighting[]>([]);
  const [possibleMatches, setPossibleMatches] = useState<PossibleMatch[]>([]);
  const [sightingNote, setSightingNote] = useState("");
  const [sightingLocation, setSightingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingSighting, setLocatingSighting] = useState(false);
  const [revealWarningOpen, setRevealWarningOpen] = useState(false);
  const [revealedContact, setRevealedContact] = useState<RevealedPetContact | null>(null);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Fase 3
  const [matchingResources, setMatchingResources] = useState<PetResource[]>([]);

  useDocumentTitle(pet?.name ?? "Detalle de mascota");

  async function load() {
    if (!id) return;
    try {
      const [res, sightingsRes, matchesRes] = await Promise.all([
        api.getPetReport(id),
        api.getPetSightings(id),
        api.getPossibleMatches(id),
      ]);
      setPet(res);
      setStatusInput(res.status);
      setSightings(sightingsRes);
      setPossibleMatches(matchesRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recursos que podrían ayudar (Fase 3) — solo tiene sentido cuando el
  // reporte ya trae un helpCategory (needs_help/injured), y se resuelve
  // después de que el pet cargue (no se conoce la categoría antes).
  useEffect(() => {
    if (!pet?.helpCategory) {
      setMatchingResources([]);
      return;
    }
    api
      .getPetResources({ category: HELP_TO_RESOURCE_CATEGORY[pet.helpCategory], departmentName: pet.departmentName, pageSize: 6 })
      .then((res) => setMatchingResources(res.resources))
      .catch(() => setMatchingResources([]));
  }, [pet?.helpCategory, pet?.departmentName]);

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

  // Confirmar/avistar/revelar contacto no piden cuenta (mismo criterio que
  // confirmar un reporte, ver ReportDetailPage.tsx) — con perfil o con
  // guestContact ya recordado en esta visita, la acción corre directo; si
  // no, se abre GuestConfirmModal una sola vez y la acción pendiente se
  // retoma al enviarlo.
  function runGuestGated(action: PendingAction) {
    if (!profile && !guestContact) {
      setPendingAction(action);
      setGuestModalOpen(true);
      return;
    }
    performAction(action, profile ? undefined : guestContact!);
  }

  async function performAction(action: PendingAction, contact?: GuestContact, honeypot?: string) {
    if (!pet) return;
    setError(null);
    try {
      const guest = contact
        ? {
            displayName: contact.displayName,
            email: contact.email,
            phone: contact.phone,
            recaptchaToken: await getRecaptchaToken(RECAPTCHA_ACTION[action.kind]),
            website: honeypot,
          }
        : undefined;

      if (action.kind === "confirm") {
        setPet(await api.confirmPet(pet.id, action.type, guest));
      } else if (action.kind === "sighting") {
        const sighting = await api.createPetSighting(pet.id, { lat: action.lat, lng: action.lng, note: action.note }, guest);
        setSightings((prev) => [sighting, ...prev]);
        setSightingNote("");
        setSightingLocation(null);
      } else {
        setRevealedContact(await api.revealPetContact(pet.id, guest));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    }
  }

  async function handleGuestModalSubmit(contact: GuestContact, honeypot: string) {
    rememberGuestContact(contact);
    setGuestModalOpen(false);
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      await performAction(action, contact, honeypot);
    }
  }

  function useMySightingLocation() {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocatingSighting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingSighting(false);
        setSightingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocatingSighting(false);
        setError("No se pudo obtener tu ubicación.");
      }
    );
  }

  function submitSighting() {
    if (!sightingNote.trim() && !sightingLocation) {
      setError("Agrega una ubicación o una nota para el avistamiento.");
      return;
    }
    runGuestGated({ kind: "sighting", lat: sightingLocation?.lat, lng: sightingLocation?.lng, note: sightingNote.trim() || undefined });
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

      <p className="mt-2 text-[11px] text-slate-500">
        Última actualización {relativeTime(pet.lastConfirmedAt)}.
        {pet.confirmationsCount != null && (
          <>
            {" "}
            {pet.confirmationsCount} confirmación{pet.confirmationsCount === 1 ? "" : "es"}
            {pet.incorrectCount ? ` · ${pet.incorrectCount} marcada${pet.incorrectCount === 1 ? "" : "s"} como incorrecta` : ""}.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => runGuestGated({ kind: "confirm", type: "confirm" })}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white"
        >
          ✓ CONFIRMAR
        </button>
        <button
          onClick={() => runGuestGated({ kind: "confirm", type: "incorrect" })}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          REPORTAR INCORRECTO
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          COMPARTIR
        </button>
        {!revealedContact && (
          <button
            onClick={() => setRevealWarningOpen(true)}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
          >
            VER CONTACTO
          </button>
        )}
      </div>

      {revealWarningOpen && !revealedContact && (
        <div className="mt-3 rounded-xl border border-warn bg-warn/10 px-3 py-3 text-xs">
          <p className="text-warn">
            Vas a ver el nombre y correo o celular de quien reportó esta mascota. Úsalo con respeto — no lo compartas
            ni lo uses para otro fin.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                setRevealWarningOpen(false);
                runGuestGated({ kind: "reveal" });
              }}
              className="rounded-lg bg-warn px-3 py-1.5 text-xs font-bold text-ink"
            >
              Sí, mostrar contacto
            </button>
            <button onClick={() => setRevealWarningOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {revealedContact && (
        <div className="mt-3 rounded-xl border border-border bg-surface2 px-3 py-3 text-sm">
          <p className="font-semibold">{revealedContact.displayName}</p>
          {revealedContact.email && (
            <a href={`mailto:${revealedContact.email}`} className="mt-1 block text-accent underline">
              {revealedContact.email}
            </a>
          )}
          {revealedContact.phone && (
            <a href={`tel:${revealedContact.phone}`} className="mt-1 block text-accent underline">
              {revealedContact.phone}
            </a>
          )}
        </div>
      )}

      {possibleMatches.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Posibles coincidencias</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Mascotas de la misma especie reportadas cerca — no es una confirmación automática, revísalas con calma.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {possibleMatches.map((m) => {
              const mSpecies = PET_SPECIES_META[m.species];
              return (
                <Link
                  key={m.id}
                  to={`/mascotas/${m.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 hover:bg-surface2"
                >
                  <div>
                    <PetStatusBadge status={m.status} compact />
                    <p className="mt-1 text-sm font-semibold">
                      {mSpecies.emoji} {m.name ?? `${mSpecies.label} sin nombre`}
                    </p>
                    <p className="text-xs text-slate-400">{m.municipalityName}, {m.departmentName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{(m.distanceMeters / 1000).toFixed(1)} km</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {matchingResources.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Recursos que podrían ayudar</h2>
          <div className="mt-2 flex flex-col gap-2">
            {matchingResources.map((r) => {
              const meta = PET_RESOURCE_CATEGORY_META[r.category];
              return (
                <div key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                  <span className="w-fit rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                    {meta.emoji} {meta.label}
                  </span>
                  <p className="mt-1 font-semibold">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.municipalityName}, {r.departmentName}</p>
                  {r.contactPhone && (
                    <a href={`tel:${r.contactPhone}`} className="mt-1 block text-xs text-accent underline">
                      {r.contactPhone}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {pet.reportType === "lost" && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">¿La has visto? — LA VI AQUÍ</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Un avistamiento no cambia el estado del reporte — solo ayuda a quien la busca a acotar dónde mirar.
          </p>
          <button
            onClick={useMySightingLocation}
            className="mt-3 h-10 w-full rounded-lg border border-border text-xs font-semibold"
          >
            {locatingSighting ? "Ubicando…" : sightingLocation ? "📍 Ubicación agregada — toca para actualizar" : "📍 Usar mi ubicación"}
          </button>
          <textarea
            value={sightingNote}
            onChange={(e) => setSightingNote(e.target.value)}
            placeholder="¿Dónde y cuándo la viste? (opcional si ya diste tu ubicación)"
            className="mt-2 min-h-[60px] w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
          />
          <button onClick={submitSighting} className="mt-2 h-10 w-full rounded-lg bg-accent text-sm font-bold text-white">
            Reportar avistamiento
          </button>

          {sightings.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {sightings.map((s) => (
                <div key={s.id} className="rounded-lg border border-border bg-surface2 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{s.lat != null ? "📍 Con ubicación" : "Sin ubicación"}</span>
                    <span>{relativeTime(s.createdAt)}</span>
                  </div>
                  {s.note && <p className="mt-1">{s.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <PetShareSheet petId={pet.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <GuestConfirmModal
        open={guestModalOpen}
        onCancel={() => {
          setGuestModalOpen(false);
          setPendingAction(null);
        }}
        onSubmit={handleGuestModalSubmit}
      />
    </div>
  );
}
