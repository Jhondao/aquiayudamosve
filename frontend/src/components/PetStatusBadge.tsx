import type { PetStatus } from "../types";
import { PET_STATUS_META } from "./petStatusStyle";

export function PetStatusBadge({ status, compact }: { status: PetStatus; compact?: boolean }) {
  const meta = PET_STATUS_META[status];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-lg font-bold ${meta.badgeClass} ${
        compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs"
      }`}
    >
      {meta.emoji} {meta.label.toUpperCase()}
    </span>
  );
}
