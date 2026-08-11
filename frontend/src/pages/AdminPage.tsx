import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { TrustBadge } from "../components/TrustBadge";
import { relativeTime } from "../utils/time";
import type { Report } from "../types";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { displayName: string } | null;
};

export default function AdminPage() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [flagged, audit] = await Promise.all([api.getFlaggedReports(), api.getAuditLogs()]);
      setReports(flagged.reports);
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

  async function act(id: string, action: "hide" | "unhide" | "markFalse") {
    const reason = window.prompt("Motivo de la acción (queda registrado en el log de auditoría):");
    if (!reason) return;
    try {
      await api.moderateReport(id, action, reason);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar la acción.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-extrabold">Panel de moderación</h1>
      <p className="mt-1 text-sm text-slate-400">Toda acción queda registrada en el log de auditoría.</p>
      {error && <p className="mt-3 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface2 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Ciudad</th>
              <th className="px-3 py-2">Confianza</th>
              <th className="px-3 py-2">Denuncias</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No hay reportes denunciados u ocultos.
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">{r.city}</td>
                <td className="px-3 py-2">
                  <TrustBadge level={r.trustLevel} label={String(r.trustScore)} compact />
                </td>
                <td className="px-3 py-2">{r.confirmationsCount}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => act(r.id, r.status === "hidden" ? "unhide" : "hide")} className="rounded-lg border border-border px-2 py-1 text-xs">
                      {r.status === "hidden" ? "Mostrar" : "Ocultar"}
                    </button>
                    <button onClick={() => act(r.id, "markFalse")} className="rounded-lg border border-border px-2 py-1 text-xs">
                      Marcar falso
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
