import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { TrustBadge } from "../components/TrustBadge";
import { relativeTime } from "../utils/time";
import type { Report } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { displayName: string } | null;
};

type Action = "hide" | "unhide" | "markFalse" | "resolve" | "delete";

export default function AdminPage() {
  useDocumentTitle("Panel de administración");

  const { profile } = useAuth();
  const [flagged, setFlagged] = useState<Report[]>([]);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [flaggedRes, allRes, audit] = await Promise.all([
        api.getFlaggedReports(),
        api.getAllReports(),
        api.getAuditLogs(),
      ]);
      setFlagged(flaggedRes.reports);
      setAllReports(allRes.reports);
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el panel.");
    }
  }

  useEffect(() => {
    if (profile && (profile.role === "moderator" || profile.role === "admin")) load();
  }, [profile]);

  if (!profile || (profile.role !== "moderator" && profile.role !== "admin")) {
    return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-slate-400">No tienes acceso a esta sección.</p>;
  }

  async function act(id: string, action: Action) {
    if (action === "delete") {
      if (!window.confirm("Esto elimina el reporte de todas las vistas (no solo ocultarlo). ¿Continuar?")) return;
    }
    const reason = window.prompt("Motivo de la acción (queda registrado en el log de auditoría):");
    if (!reason) return;
    try {
      const updated = await api.moderateReport(id, action, reason);
      if (action === "delete") {
        setFlagged((prev) => prev.filter((r) => r.id !== id));
        setAllReports((prev) => prev.filter((r) => r.id !== id));
      } else if (updated) {
        setFlagged((prev) => prev.map((r) => (r.id === id ? updated : r)));
        setAllReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
      }
      const audit = await api.getAuditLogs();
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar la acción.");
    }
  }

  function ActionButtons({ r }: { r: Report }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => act(r.id, r.status === "hidden" ? "unhide" : "hide")} className="rounded-lg border border-border px-2 py-1 text-xs">
          {r.status === "hidden" ? "Mostrar" : "Ocultar"}
        </button>
        {r.status !== "inactive" && (
          <button onClick={() => act(r.id, "resolve")} className="rounded-lg border border-border px-2 py-1 text-xs">
            Marcar no vigente
          </button>
        )}
        <button onClick={() => act(r.id, "markFalse")} className="rounded-lg border border-border px-2 py-1 text-xs">
          Marcar falso
        </button>
        <button onClick={() => act(r.id, "delete")} className="rounded-lg border border-danger px-2 py-1 text-xs text-danger">
          Eliminar
        </button>
      </div>
    );
  }

  function ReportsTable({ reports, emptyLabel }: { reports: Report[]; emptyLabel: string }) {
    return (
      <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface2 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Municipio</th>
              <th className="px-3 py-2">Confianza</th>
              <th className="px-3 py-2">Denuncias</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Última actividad</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">{r.municipalityName}, {r.departmentName}</td>
                <td className="px-3 py-2">
                  <TrustBadge level={r.trustLevel} label={String(r.trustScore)} compact />
                </td>
                <td className="px-3 py-2">{r.confirmationsCount}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{relativeTime(r.lastConfirmedAt)}</td>
                <td className="px-3 py-2">
                  <ActionButtons r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-extrabold">Panel de moderación</h1>
      <p className="mt-1 text-sm text-slate-400">Toda acción queda registrada en el log de auditoría.</p>
      {error && <p className="mt-3 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <h2 className="mt-6 text-sm font-bold">Denunciados u ocultos</h2>
      <ReportsTable reports={flagged} emptyLabel="No hay reportes denunciados u ocultos." />

      <h2 className="mt-8 text-sm font-bold">Todos los reportes</h2>
      <p className="mt-1 text-xs text-slate-400">
        Usa "Marcar no vigente" cuando la necesidad ya se resolvió (no es un error, solo dejó de aplicar) y "Eliminar"
        para sacarlo por completo — por ejemplo, datos importados que resultaron incorrectos.
      </p>
      <ReportsTable reports={allReports} emptyLabel="No hay reportes." />

      <h2 className="mt-8 text-sm font-bold">Registro de auditoría</h2>
      <div className="mt-2 flex flex-col gap-1">
        {logs.length === 0 && <p className="text-sm text-slate-400">Sin acciones registradas todavía.</p>}
        {logs.map((l) => (
          <div key={l.id} className="border-b border-border py-1.5 text-xs">
            {relativeTime(l.createdAt)} — {l.actor?.displayName ?? "sistema"} · {l.action} · {l.entityType}:{l.entityId.slice(0, 8)}
          </div>
        ))}
      </div>
    </div>
  );
}
