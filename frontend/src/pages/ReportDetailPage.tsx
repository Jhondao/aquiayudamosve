import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GROUP_META } from "../components/categoryStyle";
import { TrustBadge } from "../components/TrustBadge";
import { relativeTime } from "../utils/time";
import type { Report } from "../types";

const QUICK_UPDATES: { label: string; deactivates?: boolean }[] = [
  { label: "Sigue activo" },
  { label: "Ya no está activo", deactivates: true },
  { label: "Ya llegó ayuda", deactivates: true },
  { label: "Se agotaron los suministros" },
  { label: "La vía continúa bloqueada" },
  { label: "La información parece incorrecta" },
];

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  async function load() {
    if (!id) return;
    try {
      setReport(await api.getReport(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function guardedAction(action: () => Promise<void>) {
    if (!profile) return navigate("/login");
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
    }
  }

  async function submitEvidence() {
    if (!id) return;
    if (!photo && !sourceUrl.trim()) {
      setError("Agrega una foto o un enlace de fuente.");
      return;
    }
    const form = new FormData();
    if (photo) form.append("photo", photo);
    if (sourceUrl.trim()) form.append("sourceUrl", sourceUrl.trim());
    await guardedAction(async () => {
      const res = await fetch(`/api/reports/${id}/evidence`, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("No se pudo subir la evidencia.");
      setPhoto(null);
      setSourceUrl("");
      setNotice("Evidencia agregada.");
      await load();
    });
  }

  if (error && !report) {
    return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-danger">{error}</p>;
  }
  if (!report) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-slate-400">Cargando…</p>;

  const group = GROUP_META[report.category.group];

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Link to="/" className="text-xs font-semibold text-accent">
        ← Volver
      </Link>

      {report.status === "inactive" && (
        <div className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-sm">Este reporte fue marcado como inactivo.</div>
      )}
      {report.isSensitive && (
        <div className="mt-3 rounded-xl border border-danger px-3 py-2 text-xs text-danger">
          Este reporte oculta la ubicación exacta por tratarse de información sensible.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${group.badgeClass}`}>{report.category.label}</span>
        {report.organization && (
          <span className="rounded-full border border-accent px-2.5 py-0.5 text-[11px] font-bold text-accent">
            Fuente institucional
          </span>
        )}
      </div>
      <h1 className="mt-2 text-xl font-extrabold">{report.title}</h1>
      <p className="text-xs text-slate-400">
        {report.approxLocationText} · {report.city}
      </p>
      <p className="mt-3 text-sm">{report.description}</p>

      <div className="mt-4 rounded-2xl bg-surface p-4">
        <TrustBadge level={report.trustLevel} label={report.trustLevelLabel} />
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
          <div className="h-full rounded-full bg-accent" style={{ width: `${report.trustScore}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">{report.trustLevelDescription}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          La confianza no es una garantía de verdad: se calcula con confirmaciones, evidencia y actualidad.{" "}
          {report.confirmationsCount} confirmaciones · última {relativeTime(report.lastConfirmedAt)}.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => guardedAction(async () => setReport(await api.confirmReport(report.id, "confirm")))}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white"
        >
          ✓ CONFIRMAR
        </button>
        <button
          onClick={() => guardedAction(async () => setReport(await api.confirmReport(report.id, "unsure")))}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          NO ESTOY SEGURO
        </button>
        <button
          onClick={() => guardedAction(async () => setReport(await api.confirmReport(report.id, "incorrect")))}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          REPORTAR INCORRECTO
        </button>
      </div>

      <p className="mt-5 text-xs text-slate-400">Actualizaciones rápidas</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_UPDATES.map((q) => (
          <button
            key={q.label}
            onClick={() =>
              guardedAction(async () => setReport(await api.addUpdate(report.id, q.label, q.deactivates)))
            }
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs"
          >
            {q.label}
          </button>
        ))}
      </div>

      {report.evidence.length > 0 && (
        <>
          <p className="mt-5 text-sm font-bold">Evidencia aportada</p>
          <p className="text-[11px] text-slate-500">
            Una fotografía o enlace no es por sí sola una prueba definitiva; se pondera junto al resto de señales.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {report.evidence.map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                {e.imageUrl && (
                  <img src={e.imageUrl} alt="Evidencia adjunta" className="mb-2 max-h-64 w-full rounded-lg object-cover" />
                )}
                {e.sourceUrl && (
                  <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="block text-accent underline">
                    Fuente: {e.sourceUrl}
                  </a>
                )}
                {e.relatedOrgName && <p className="mt-1 text-slate-400">Organización relacionada: {e.relatedOrgName}</p>}
                <p className="mt-1 text-slate-500">{relativeTime(e.createdAt)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-5 text-sm font-bold">Agregar evidencia (opcional)</p>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mt-2 block text-xs"
      />
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="Enlace a una fuente (opcional)"
        className="mt-2 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
      />
      <button onClick={submitEvidence} className="mt-2 rounded-lg border border-border px-4 py-2 text-xs font-semibold">
        Agregar evidencia
      </button>
      {notice && <p className="mt-2 text-xs text-safe">{notice}</p>}

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <p className="mt-6 text-sm font-bold">Trazabilidad</p>
      <div className="mt-2 flex flex-col">
        {report.timeline.map((t, i) => (
          <div key={i} className="flex gap-3 border-b border-border py-2 text-sm">
            <span className="min-w-[70px] text-xs text-slate-500">{relativeTime(t.at)}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
