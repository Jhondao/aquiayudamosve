import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GuestContactFields } from "../components/GuestContactFields";
import { EMPTY_LOCATION, LocationSelector } from "../components/LocationSelector";
import { getRecaptchaToken } from "../utils/recaptcha";
import { PET_HELP_CATEGORY_LABEL, PET_SPECIES_META } from "../components/petStatusStyle";
import type { PetHelpCategory, PetReportType, PetSex, PetSize, PetSpecies } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// Solo 3 opciones a propósito (el plan de Fase 1 pide exactamente estos 3
// botones, sin "QUIERO AYUDAR"). "injured" sigue siendo un PetReportType
// válido en el backend/tipos — mismo motivo que possible_match en
// PetDetailPage.tsx: reservado para cuando la UI distinga "herida" de
// "necesita ayuda" en una fase futura — pero ningún flujo de Fase 1 lo
// selecciona; isPetReportType() abajo solo lo acepta si llega por URL directa.
const TYPE_OPTIONS: { key: PetReportType; label: string }[] = [
  { key: "lost", label: "Perdí mi mascota" },
  { key: "found", label: "Encontré una mascota" },
  { key: "needs_help", label: "Necesita ayuda" },
];

const SEX_OPTIONS: { key: PetSex; label: string }[] = [
  { key: "unknown", label: "No sé" },
  { key: "male", label: "Macho" },
  { key: "female", label: "Hembra" },
];

const SIZE_OPTIONS: { key: PetSize; label: string }[] = [
  { key: "small", label: "Pequeño" },
  { key: "medium", label: "Mediano" },
  { key: "large", label: "Grande" },
];

function isPetReportType(v: string | null): v is PetReportType {
  return v === "lost" || v === "found" || v === "needs_help" || v === "injured";
}

export default function PetReportPage() {
  useDocumentTitle("Reportar una mascota");

  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get("type");

  const [reportType, setReportType] = useState<PetReportType>(isPetReportType(initialType) ? initialType : "lost");
  const [species, setSpecies] = useState<PetSpecies>("dog");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<PetSex>("unknown");
  const [size, setSize] = useState<PetSize | "">("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [distinctiveFeatures, setDistinctiveFeatures] = useState("");
  const [description, setDescription] = useState("");
  const [isSheltered, setIsSheltered] = useState(false);
  const [helpCategory, setHelpCategory] = useState<PetHelpCategory | "">("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [happenedAt, setHappenedAt] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsHelpCategory = reportType === "needs_help" || reportType === "injured";

  async function submit() {
    setError(null);
    if (!species || !description.trim() || !location.departmentName.trim() || !location.municipalityName.trim() || location.lat == null || location.lng == null) {
      setError("Completa la especie, la descripción y el punto en el mapa.");
      return;
    }
    if (needsHelpCategory && !helpCategory) {
      setError("Indica qué tipo de ayuda necesita.");
      return;
    }
    if (!profile && (!displayName.trim() || (!email.trim() && !phone.trim()))) {
      setError("Agrega tu nombre y tu correo o celular, o inicia sesión.");
      return;
    }
    setSubmitting(true);
    try {
      const pet = await api.createPetReport(
        {
          reportType,
          species,
          name: name.trim() || undefined,
          breed: breed.trim() || undefined,
          sex,
          size: size || undefined,
          primaryColor: primaryColor.trim() || undefined,
          distinctiveFeatures: distinctiveFeatures.trim() || undefined,
          description: description.trim(),
          departmentName: location.departmentName.trim(),
          municipalityName: location.municipalityName.trim(),
          localityName: location.localityName.trim() || undefined,
          locationSource: location.locationSource ?? "manual",
          approxLocationText: location.approxLocationText.trim() || undefined,
          lat: location.lat,
          lng: location.lng,
          happenedAt: happenedAt ? new Date(happenedAt).toISOString() : undefined,
          isSheltered: reportType === "found" ? isSheltered : undefined,
          helpCategory: needsHelpCategory && helpCategory ? helpCategory : undefined,
          isEmergency: needsHelpCategory ? isEmergency : undefined,
          ...(profile
            ? {}
            : {
                displayName: displayName.trim(),
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                recaptchaToken: await getRecaptchaToken("CREATE_PET_REPORT"),
                website,
              }),
        },
        photo
      );
      navigate(`/mascotas/${pet.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el reporte.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        onClick={() => navigate("/mascotas")}
        className="mb-2 inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-3 text-sm font-semibold text-slate-200 hover:bg-surface2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
        Volver a mascotas
      </button>
      <h1 className="text-xl font-extrabold">🐾 Reportar una mascota</h1>
      <p className="mt-1 text-sm text-slate-400">Menos de un minuto — sin necesidad de cuenta.</p>

      <div className="mt-4 flex overflow-hidden rounded-xl border border-border">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setReportType(t.key)}
            className={`flex-1 py-2.5 text-xs font-semibold sm:text-sm ${
              reportType === t.key ? "bg-white text-ink" : "bg-surface text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-xs font-semibold text-slate-400">Especie</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {(Object.keys(PET_SPECIES_META) as PetSpecies[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSpecies(key)}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              species === key ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
            }`}
          >
            {PET_SPECIES_META[key].emoji} {PET_SPECIES_META[key].label}
          </button>
        ))}
      </div>

      {reportType === "found" && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-400">¿La tienes contigo ahora?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setIsSheltered(true)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                isSheltered ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
              }`}
            >
              Sí, la tengo resguardada
            </button>
            <button
              type="button"
              onClick={() => setIsSheltered(false)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                !isSheltered ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
              }`}
            >
              No, solo la vi
            </button>
          </div>
          {isSheltered && (
            <p className="mt-2 text-[11px] text-slate-500">
              Por privacidad, no mostraremos tu dirección exacta — solo una zona aproximada.
            </p>
          )}
        </div>
      )}

      {needsHelpCategory && (
        <>
          <label className="mt-4 block text-xs font-semibold text-slate-400">¿Qué tipo de ayuda necesita?</label>
          <select
            value={helpCategory}
            onChange={(e) => setHelpCategory(e.target.value as PetHelpCategory)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">Selecciona…</option>
            {Object.entries(PET_HELP_CATEGORY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
            Es urgente — su vida puede estar en riesgo
          </label>
        </>
      )}

      <label className="mt-4 block text-xs font-semibold text-slate-400">Descripción</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Detalles útiles: dónde, cuándo, comportamiento, collar, etc."
        className="mt-1 min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />

      <div className="mt-4 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400">Nombre (opcional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Si lo conoces"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400">Raza (opcional)</label>
          <input
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder="Mestizo, labrador…"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400">Sexo</label>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as PetSex)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            {SEX_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-400">Tamaño (opcional)</label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as PetSize)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">No sé</option>
            {SIZE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-3 block text-xs font-semibold text-slate-400">Color principal (opcional)</label>
      <input
        value={primaryColor}
        onChange={(e) => setPrimaryColor(e.target.value)}
        placeholder="Ej: Café, negro y blanco…"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold text-slate-400">Señas particulares (opcional)</label>
      <input
        value={distinctiveFeatures}
        onChange={(e) => setDistinctiveFeatures(e.target.value)}
        placeholder="Collar, cicatrices, cojea, etc."
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-400">
        Foto {reportType === "lost" ? "(muy recomendada)" : "(opcional)"}
      </label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mt-1 block text-xs"
      />

      <div className="mt-4">
        <LocationSelector value={location} onChange={setLocation} />
      </div>

      <label className="mt-3 block text-xs font-semibold text-slate-400">
        {reportType === "lost" ? "¿Cuándo se perdió? (opcional)" : "¿Cuándo la viste/encontraste? (opcional)"}
      </label>
      <input
        type="datetime-local"
        value={happenedAt}
        onChange={(e) => setHappenedAt(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      {!profile && (
        <GuestContactFields
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          displayName={displayName}
          setDisplayName={setDisplayName}
          phoneRequired={false}
          honeypot={{ value: website, setValue: setWebsite }}
        />
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
