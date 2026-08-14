import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import { PET_RESOURCE_CATEGORY_META } from "../components/petStatusStyle";
import type { PetResourceCategory } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const CATEGORY_OPTIONS: PetResourceCategory[] = ["veterinary", "transport", "temporary_home", "attention_point", "rescue", "other"];

export default function PetResourceFormPage() {
  useDocumentTitle("Ofrecer ayuda con mascotas");

  const { profile } = useAuth();
  const navigate = useNavigate();

  const [category, setCategory] = useState<PetResourceCategory>("veterinary");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState(profile?.displayName ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === department)?.municipalities ?? [];

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-slate-400">Necesitas una cuenta para ofrecer ayuda — ofrecer un servicio compromete tu identidad.</p>
        <button onClick={() => navigate("/login")} className="mt-4 h-11 rounded-xl border border-border px-6 text-sm font-semibold">
          Inicia sesión
        </button>
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !description.trim() || !contactName.trim() || !department.trim() || !municipality.trim()) {
      setError("Completa nombre, descripción, contacto y territorio.");
      return;
    }
    if (!contactEmail.trim() && !contactPhone.trim()) {
      setError("Agrega un correo o celular de contacto.");
      return;
    }
    setSubmitting(true);
    try {
      const resource = await api.createPetResource({
        category,
        name: name.trim(),
        description: description.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        departmentName: department.trim(),
        municipalityName: municipality.trim(),
        availabilityNote: availabilityNote.trim() || undefined,
      });
      navigate(`/mascotas/ayudar`, { state: { createdId: resource.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el recurso.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-extrabold">🤝 Ofrecer ayuda con mascotas</h1>
      <p className="mt-1 text-sm text-slate-400">
        Tu servicio aparecerá en el directorio público y en los reportes que necesiten esta categoría de ayuda.
      </p>

      <label className="mt-4 block text-xs font-semibold text-slate-400">¿Qué tipo de ayuda ofreces?</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((c) => {
          const meta = PET_RESOURCE_CATEGORY_META[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                category === c ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
              }`}
            >
              {meta.emoji} {meta.label}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block text-xs font-semibold text-slate-400">Nombre</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ej: Clínica Veterinaria San Roque"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-400">Descripción</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Qué ofreces, condiciones, capacidad, etc."
        className="mt-1 min-h-[80px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-400">Disponibilidad (opcional)</label>
      <input
        value={availabilityNote}
        onChange={(e) => setAvailabilityNote(e.target.value)}
        placeholder="Ej: Lunes a sábado, 8am-6pm"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setMunicipality("");
          }}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
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
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm disabled:opacity-50"
        >
          <option value="">Municipio…</option>
          {municipalityOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface2/40 p-3">
        <p className="text-xs font-semibold text-slate-300">Contacto</p>
        <label className="mt-3 block text-xs font-semibold text-slate-400">Nombre de contacto</label>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        />
        <label className="mt-3 block text-xs font-semibold text-slate-400">Correo</label>
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        />
        <label className="mt-3 block text-xs font-semibold text-slate-400">Celular (correo o celular, al menos uno)</label>
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="Ej: 3001234567"
          className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        />
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-5 h-12 w-full rounded-xl bg-accent text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Publicando…" : "PUBLICAR RECURSO"}
      </button>
    </div>
  );
}
