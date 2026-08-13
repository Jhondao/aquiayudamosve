import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const REPUTATION_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  colaborador: "Colaborador",
  colaborador_confiable: "Colaborador confiable",
  voluntario_verificado: "Voluntario verificado",
  organizacion: "Organización",
  entidad_institucional: "Entidad institucional",
};

export default function ProfilePage() {
  useDocumentTitle("Mi perfil");

  const { profile } = useAuth();
  const [reports, setReports] = useState<
    { id: string; title: string; departmentName: string; municipalityName: string; status: string; trustScore: number }[]
  >([]);

  useEffect(() => {
    if (profile) api.myReports().then((res) => setReports(res.reports as never));
  }, [profile]);

  if (!profile) return <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-slate-400">Inicia sesión para ver tu perfil.</p>;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-extrabold">{profile.displayName}</h1>
      <p className="mt-1 text-sm text-slate-400">Nivel: {REPUTATION_LABEL[profile.reputationLevel] ?? profile.reputationLevel}</p>
      {profile.organization && (
        <p className="mt-1 text-sm text-accent">
          {profile.organization.name} {profile.organization.verified ? "(verificada)" : "(pendiente de verificación)"}
        </p>
      )}

      <h2 className="mt-6 text-sm font-bold">Tus reportes</h2>
      <div className="mt-2 flex flex-col gap-2">
        {reports.length === 0 && <p className="text-sm text-slate-400">Todavía no has publicado reportes.</p>}
        {reports.map((r) => (
          <Link key={r.id} to={`/reporte/${r.id}`} className="rounded-xl border border-border bg-surface p-3 text-sm hover:border-accent">
            <div className="font-semibold">{r.title}</div>
            <div className="text-xs text-slate-400">
              {r.municipalityName}, {r.departmentName} · confianza {r.trustScore} · {r.status}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
