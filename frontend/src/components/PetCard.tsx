import { Link } from "react-router-dom";
import type { PetReport } from "../types";
import { PetStatusBadge } from "./PetStatusBadge";
import { PET_SPECIES_META } from "./petStatusStyle";
import { relativeTime } from "../utils/time";

export function PetCard({ pet }: { pet: PetReport }) {
  const species = PET_SPECIES_META[pet.species];
  const title = pet.name ? `${species.emoji} ${pet.name}` : `${species.emoji} ${species.label} sin nombre`;

  return (
    <Link
      to={`/mascotas/${pet.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm hover:bg-surface2"
    >
      <div className="flex items-center gap-2">
        <PetStatusBadge status={pet.status} compact />
        {pet.isEmergency && (
          <span className="rounded-full border border-danger px-2.5 py-0.5 text-[11px] font-bold text-danger">Urgente</span>
        )}
      </div>

      <span className="text-base font-bold leading-snug">{title}</span>
      <div className="text-xs text-slate-400">
        {[pet.breed, pet.primaryColor].filter(Boolean).join(" · ") || species.label} ·{" "}
        {pet.approxLocationText ?? pet.municipalityName}, {pet.departmentName}
      </div>

      {pet.distinctiveFeatures && <p className="text-xs text-slate-400 line-clamp-2">{pet.distinctiveFeatures}</p>}

      <div className="text-xs text-slate-500">Actualizado {relativeTime(pet.lastConfirmedAt)}</div>
    </Link>
  );
}
