import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { TrustBadge } from "../components/TrustBadge";
import { PetStatusBadge } from "../components/PetStatusBadge";
import { PET_RESOURCE_CATEGORY_META, PET_SPECIES_META } from "../components/petStatusStyle";
import { relativeTime } from "../utils/time";
import type { PetReport, PetResource, Report } from "../types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

type AdminPetReport = PetReport & { hidden: boolean };
type AdminPetResource = PetResource & { hidden: boolean };

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
  const [pets, setPets] = useState<AdminPetReport[]>([]);
  const [resources, setResources] = useState<AdminPetResource[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fase 4 — bajo demanda, no en el load() inicial (escanear pares es más
  // caro que un listado normal, ver pets.service.ts#findDuplicatePets).
  const [duplicatePairs, setDuplicatePairs] = useState<{ a: PetReport; b: PetReport; distanceMeters: number }[] | null>(null);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);

  async function load() {
    try {
      const [flaggedRes, allRes, petsRes, resourcesRes, audit] = await Promise.all([
        api.getFlaggedReports(),
        api.getAllReports(),
        api.getAllPets(),
        api.getAllPetResources(),
        api.getAuditLogs(),
      ]);
      setFlagged(flaggedRes.reports);
      setAllReports(allRes.reports);
      setPets(petsRes.pets);
      setResources(resourcesRes.resources);
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

  async function actPet(id: string, action: "hide" | "unhide" | "delete") {
    if (action === "delete") {
      if (!window.confirm("Esto elimina el reporte de mascota de todas las vistas (no solo ocultarlo). ¿Continuar?")) return;
    }
    const reason = window.prompt("Motivo de la acción (queda registrado en el log de auditoría):");
    if (!reason) return;
    try {
      const updated = await api.moderatePet(id, action, reason);
      if (action === "delete") {
        setPets((prev) => prev.filter((p) => p.id !== id));
      } else if (updated) {
        setPets((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
      const audit = await api.getAuditLogs();
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar la acción.");
    }
  }

  async function loadDuplicates() {
    setLoadingDuplicates(true);
    try {
      const res = await api.getPetDuplicates();
      setDuplicatePairs(res.pairs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los posibles duplicados.");
    } finally {
      setLoadingDuplicates(false);
    }
  }

  async function mergePair(id: string, intoId: string) {
    const reason = window.prompt("Motivo de la fusión (queda registrado en el log de auditoría):");
    if (!reason) return;
    try {
      await api.mergePets(id, intoId, reason);
      setDuplicatePairs((prev) => (prev ?? []).filter((p) => p.a.id !== id && p.b.id !== id));
      setPets((prev) => prev.filter((p) => p.id !== id));
      const audit = await api.getAuditLogs();
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo fusionar.");
    }
  }

  function PetsTable({ pets: rows }: { pets: AdminPetReport[] }) {
    return (
      <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface2 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Mascota</th>
              <th className="px-3 py-2">Municipio</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Oculto</th>
              <th className="px-3 py-2">Última actividad</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No hay reportes de mascotas.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {PET_SPECIES_META[p.species].emoji} {p.name ?? PET_SPECIES_META[p.species].label}
                </td>
                <td className="px-3 py-2">{p.municipalityName}, {p.departmentName}</td>
                <td className="px-3 py-2">
                  <PetStatusBadge status={p.status} compact />
                </td>
                <td className="px-3 py-2">{p.hidden ? "Sí" : "No"}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{relativeTime(p.lastConfirmedAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => actPet(p.id, p.hidden ? "unhide" : "hide")} className="rounded-lg border border-border px-2 py-1 text-xs">
                      {p.hidden ? "Mostrar" : "Ocultar"}
                    </button>
                    <button onClick={() => actPet(p.id, "delete")} className="rounded-lg border border-danger px-2 py-1 text-xs text-danger">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  async function actResource(id: string, action: "hide" | "unhide" | "delete") {
    if (action === "delete") {
      if (!window.confirm("Esto elimina el recurso de todas las vistas (no solo ocultarlo). ¿Continuar?")) return;
    }
    const reason = window.prompt("Motivo de la acción (queda registrado en el log de auditoría):");
    if (!reason) return;
    try {
      const updated = await api.moderatePetResource(id, action, reason);
      if (action === "delete") {
        setResources((prev) => prev.filter((r) => r.id !== id));
      } else if (updated) {
        setResources((prev) => prev.map((r) => (r.id === id ? updated : r)));
      }
      const audit = await api.getAuditLogs();
      setLogs(audit.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar la acción.");
    }
  }

  function PetResourcesTable({ resources: rows }: { resources: AdminPetResource[] }) {
    return (
      <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface2 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Recurso</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Municipio</th>
              <th className="px-3 py-2">Oculto</th>
              <th className="px-3 py-2">Creado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No hay recursos registrados.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">
                  {PET_RESOURCE_CATEGORY_META[r.category].emoji} {PET_RESOURCE_CATEGORY_META[r.category].label}
                </td>
                <td className="px-3 py-2">{r.municipalityName}, {r.departmentName}</td>
                <td className="px-3 py-2">{r.hidden ? "Sí" : "No"}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{relativeTime(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => actResource(r.id, r.hidden ? "unhide" : "hide")} className="rounded-lg border border-border px-2 py-1 text-xs">
                      {r.hidden ? "Mostrar" : "Ocultar"}
                    </button>
                    <button onClick={() => actResource(r.id, "delete")} className="rounded-lg border border-danger px-2 py-1 text-xs text-danger">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

      <h2 className="mt-8 text-sm font-bold">🐾 Mascotas</h2>
      <p className="mt-1 text-xs text-slate-400">
        El cambio de estado (incluida "reunida") lo puede hacer cualquier persona con cuenta — igual que confirmar un
        reporte. Si alguien lo marca de mala fe, queda en el log de auditoría de abajo para poder revertirlo.
      </p>
      <PetsTable pets={pets} />

      <h2 className="mt-8 text-sm font-bold">Posibles duplicados</h2>
      <p className="mt-1 text-xs text-slate-400">
        Mascotas de la misma especie, cerca entre sí y del mismo lado (perdida↔perdida o encontrada↔encontrada) — se
        calcula bajo demanda, no en cada carga del panel.
      </p>
      {duplicatePairs === null ? (
        <button
          onClick={loadDuplicates}
          disabled={loadingDuplicates}
          className="mt-2 h-10 rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-50"
        >
          {loadingDuplicates ? "Buscando…" : "Buscar posibles duplicados"}
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {duplicatePairs.length === 0 && <p className="text-sm text-slate-400">No se encontraron posibles duplicados.</p>}
          {duplicatePairs.map((pair) => (
            <div key={`${pair.a.id}-${pair.b.id}`} className="rounded-xl border border-border bg-surface p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {PET_SPECIES_META[pair.a.species].emoji} {pair.a.name ?? "Sin nombre"} ({pair.a.id.slice(0, 8)}) ↔{" "}
                  {pair.b.name ?? "Sin nombre"} ({pair.b.id.slice(0, 8)})
                </span>
                <span className="text-slate-400">{(pair.distanceMeters / 1000).toFixed(1)} km</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => mergePair(pair.a.id, pair.b.id)} className="rounded-lg border border-border px-2 py-1 font-semibold">
                  Fusionar A → B
                </button>
                <button onClick={() => mergePair(pair.b.id, pair.a.id)} className="rounded-lg border border-border px-2 py-1 font-semibold">
                  Fusionar B → A
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold">🤝 Recursos "quiero ayudar con mascotas"</h2>
      <PetResourcesTable resources={resources} />

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
