import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GROUP_META } from "../components/categoryStyle";
import { NEED_STATUS_META } from "../components/needStatusStyle";
import { TrustBadge } from "../components/TrustBadge";
import { relativeTime } from "../utils/time";
import type { CommitmentStatus, NeedStatus, Report } from "../types";

const COMMITMENT_STATUS_META: Record<CommitmentStatus, { label: string; emoji: string; badgeClass: string }> = {
  committed: { label: "Prometido", emoji: "🤝", badgeClass: "bg-accent/20 text-accent" },
  on_the_way: { label: "En camino", emoji: "🚚", badgeClass: "bg-warn/20 text-warn" },
  delivered: { label: "Entregado", emoji: "✅", badgeClass: "bg-safe/20 text-safe" },
  cancelled: { label: "Cancelado", emoji: "✖️", badgeClass: "bg-slate-500/20 text-slate-400" },
};

const QUICK_UPDATES: { label: string; deactivates?: boolean }[] = [
  { label: "Sigue activo" },
  { label: "Ya no está activo", deactivates: true },
  { label: "Ya llegó ayuda", deactivates: true },
  { label: "Se agotaron los suministros" },
  { label: "La vía continúa bloqueada" },
  { label: "La información parece incorrecta" },
];

const NEED_STATUS_OPTIONS: { value: NeedStatus; label: string }[] = [
  { value: "necesitamos", label: "Necesitamos" },
  { value: "en_camino", label: "Ayuda en camino" },
  { value: "parcialmente_cubierto", label: "Parcialmente cubierto" },
  { value: "cubierto", label: "Cubierto — no traer más" },
  { value: "excedente", label: "Excedente" },
  { value: "desactualizado", label: "Desactualizado" },
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
  const [needStatusInput, setNeedStatusInput] = useState<NeedStatus>("necesitamos");
  const [quantityReceivedInput, setQuantityReceivedInput] = useState(0);
  const [commitQuantity, setCommitQuantity] = useState("");
  const [commitUnit, setCommitUnit] = useState("");
  const [commitOnTheWay, setCommitOnTheWay] = useState(false);
  const [commitEta, setCommitEta] = useState("");
  const [commitTransport, setCommitTransport] = useState("");

  async function load() {
    if (!id) return;
    try {
      setReport(await api.getReport(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte.");
    }
  }

  useEffect(() => {
    if (report?.needStatus) setNeedStatusInput(report.needStatus);
    if (report) setQuantityReceivedInput(report.quantityReceived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

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

  async function submitCommitment() {
    const quantity = Number(commitQuantity);
    if (!quantity || quantity <= 0) {
      setError("Indica cuánto puedes aportar.");
      return;
    }
    await guardedAction(async () => {
      setReport(
        await api.createCommitment(report!.id, {
          quantity,
          unit: commitUnit.trim() || undefined,
          status: commitOnTheWay ? "on_the_way" : "committed",
          estimatedArrival: commitOnTheWay && commitEta ? new Date(commitEta).toISOString() : undefined,
          transportMethod: commitOnTheWay ? commitTransport.trim() || undefined : undefined,
        })
      );
      setCommitQuantity("");
      setCommitUnit("");
      setCommitOnTheWay(false);
      setCommitEta("");
      setCommitTransport("");
    });
  }

  if (error && !report) {
    return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-danger">{error}</p>;
  }
  if (!report) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-slate-400">Cargando…</p>;

  const group = GROUP_META[report.category.group];
  const committedTotal = report.needCommitments
    .filter((c) => c.status === "committed" || c.status === "on_the_way")
    .reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-3 text-sm font-semibold text-slate-200 hover:bg-surface2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
        Volver al mapa
      </button>

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
        {[report.approxLocationText, report.localityName].filter(Boolean).join(" · ") || "Ubicación aproximada"} ·{" "}
        {report.municipalityName}, {report.departmentName}
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

      {report.category.group === "necesidad" && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado de la necesidad</h2>
          {report.needStatus && (
            <div
              className={`mt-2 inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${NEED_STATUS_META[report.needStatus].badgeClass}`}
            >
              {NEED_STATUS_META[report.needStatus].emoji} {report.needStatusLabel?.toUpperCase()}
              {report.quantityNeeded != null &&
                ` — ${report.quantityReceived}/${report.quantityNeeded} ${report.quantityUnit ?? ""}`}
            </div>
          )}

          <button
            onClick={() =>
              guardedAction(async () => setReport(await api.updateNeedStatus(report.id, { needStatus: "cubierto" })))
            }
            className="mt-3 block w-full rounded-xl bg-safe px-4 py-2.5 text-sm font-bold text-white"
          >
            ✅ Ya está cubierto — no traer más
          </button>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={needStatusInput}
              onChange={(e) => setNeedStatusInput(e.target.value as NeedStatus)}
              className="h-11 rounded-xl border border-border bg-surface2 px-3 text-sm"
            >
              {NEED_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              value={quantityReceivedInput}
              onChange={(e) => setQuantityReceivedInput(Number(e.target.value))}
              placeholder="Cantidad recibida"
              className="h-11 w-full rounded-xl border border-border bg-surface2 px-3 text-sm sm:w-40"
            />
            <button
              onClick={() =>
                guardedAction(async () =>
                  setReport(
                    await api.updateNeedStatus(report.id, {
                      needStatus: needStatusInput,
                      quantityReceived: quantityReceivedInput,
                    })
                  )
                )
              }
              className="h-11 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Actualizar estado
            </button>
          </div>

          {report.quantityNeeded != null && (
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-sm font-bold">{report.quantityNeeded}</p>
                <p className="text-[10px] uppercase text-slate-400">Necesarios</p>
              </div>
              <div>
                <p className="text-sm font-bold">{committedTotal}</p>
                <p className="text-[10px] uppercase text-slate-400">Comprometidos</p>
              </div>
              <div>
                <p className="text-sm font-bold">{report.quantityReceived}</p>
                <p className="text-[10px] uppercase text-slate-400">Recibidos</p>
              </div>
              <div>
                <p className="text-sm font-bold">{report.quantityPending ?? "—"}</p>
                <p className="text-[10px] uppercase text-slate-400">Pendientes</p>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-border bg-surface2 p-3">
            <h3 className="text-xs font-bold">Puedo ayudar con esto</h3>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min="0"
                step="any"
                value={commitQuantity}
                onChange={(e) => setCommitQuantity(e.target.value)}
                placeholder="Cantidad"
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm sm:w-28"
              />
              <input
                value={commitUnit}
                onChange={(e) => setCommitUnit(e.target.value)}
                placeholder="Unidad (kg, cajas...)"
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={commitOnTheWay} onChange={(e) => setCommitOnTheWay(e.target.checked)} />
              Voy en camino ahora
            </label>
            {commitOnTheWay && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="datetime-local"
                  value={commitEta}
                  onChange={(e) => setCommitEta(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                />
                <input
                  value={commitTransport}
                  onChange={(e) => setCommitTransport(e.target.value)}
                  placeholder="Cómo te movilizas (opcional)"
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                />
              </div>
            )}
            <button onClick={submitCommitment} className="mt-2 h-10 w-full rounded-lg bg-accent text-sm font-bold text-white">
              Comprometer ayuda
            </button>
          </div>

          {report.needCommitments.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {report.needCommitments.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-surface2 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold ${COMMITMENT_STATUS_META[c.status].badgeClass}`}>
                      {COMMITMENT_STATUS_META[c.status].emoji} {COMMITMENT_STATUS_META[c.status].label}
                    </span>
                    <span className="text-slate-400">{relativeTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1.5">
                    {c.quantity} {c.unit ?? ""}
                    {c.transportMethod && ` · ${c.transportMethod}`}
                  </p>
                  {c.note && <p className="mt-1 text-slate-400">{c.note}</p>}
                  {c.mine && c.status !== "delivered" && c.status !== "cancelled" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.status !== "on_the_way" && (
                        <button
                          onClick={() =>
                            guardedAction(async () =>
                              setReport(await api.updateCommitment(report.id, c.id, { status: "on_the_way" }))
                            )
                          }
                          className="rounded-lg border border-border px-2.5 py-1 font-semibold"
                        >
                          Marcar en camino
                        </button>
                      )}
                      <button
                        onClick={() =>
                          guardedAction(async () =>
                            setReport(await api.updateCommitment(report.id, c.id, { status: "delivered" }))
                          )
                        }
                        className="rounded-lg border border-border px-2.5 py-1 font-semibold"
                      >
                        Marcar entregado
                      </button>
                      <button
                        onClick={() =>
                          guardedAction(async () =>
                            setReport(await api.updateCommitment(report.id, c.id, { status: "cancelled" }))
                          )
                        }
                        className="rounded-lg border border-border px-2.5 py-1 font-semibold text-danger"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Actualizaciones rápidas</h2>
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
          <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Evidencia aportada</h2>
          <p className="mt-1 text-[11px] text-slate-500">
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

      <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Agregar evidencia (opcional)</h2>
      <div className="mt-2 rounded-2xl border border-border bg-surface p-4">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="block text-xs"
        />
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Enlace a una fuente (opcional)"
          className="mt-3 h-10 w-full rounded-lg border border-border bg-surface2 px-3 text-sm"
        />
        <button onClick={submitEvidence} className="mt-3 rounded-lg border border-border px-4 py-2 text-xs font-semibold">
          Agregar evidencia
        </button>
        {notice && <p className="mt-2 text-xs text-safe">{notice}</p>}
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Trazabilidad</h2>
      <div className="mt-2 rounded-2xl border border-border bg-surface px-4">
        {report.timeline.map((t, i) => (
          <div key={i} className="flex gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
            <span className="min-w-[70px] shrink-0 text-xs text-slate-500">{relativeTime(t.at)}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
