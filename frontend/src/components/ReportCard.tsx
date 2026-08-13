import { Link } from "react-router-dom";
import type { Report } from "../types";
import { GROUP_META } from "./categoryStyle";
import { NEED_STATUS_META } from "./needStatusStyle";
import { TrustBadge } from "./TrustBadge";
import { relativeTime } from "../utils/time";

export function ReportCard({ report, onConfirm }: { report: Report; onConfirm?: (id: string) => void }) {
  const group = GROUP_META[report.category.group];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${group.badgeClass}`}>
          {report.category.label}
        </span>
        {report.organization && (
          <span className="rounded-full border border-accent px-2.5 py-0.5 text-[11px] font-bold text-accent">
            {report.organization.name}
          </span>
        )}
        {report.status === "inactive" && (
          <span className="ml-auto text-[11px] font-semibold text-slate-500">Inactivo</span>
        )}
      </div>

      <Link to={`/reporte/${report.id}`} className="text-base font-bold leading-snug hover:underline">
        {report.title}
      </Link>
      <div className="text-xs text-slate-400">
        {report.approxLocationText} · {report.city}
      </div>

      {report.needStatus && (
        <div
          className={`inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${NEED_STATUS_META[report.needStatus].badgeClass}`}
        >
          {NEED_STATUS_META[report.needStatus].emoji} {report.needStatusLabel?.toUpperCase()}
          {report.quantityNeeded != null &&
            ` — ${report.quantityReceived}/${report.quantityNeeded} ${report.quantityUnit ?? ""}`}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <TrustBadge level={report.trustLevel} label={report.trustLevelLabel} compact />
        <span>· {report.confirmationsCount} confirmaciones</span>
        <span>· última: {relativeTime(report.lastConfirmedAt)}</span>
      </div>

      {onConfirm && (
        <button
          onClick={() => onConfirm(report.id)}
          className="mt-1 self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white active:scale-[0.98]"
        >
          CONFIRMAR
        </button>
      )}
    </div>
  );
}
