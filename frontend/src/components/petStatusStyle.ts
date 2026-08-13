import type { PetHelpCategory, PetReportType, PetSpecies, PetStatus } from "../types";

// A diferencia de needStatusStyle.ts, acá el texto SÍ vive en el frontend —
// pets.service.ts#serializePetReport nunca calculó labels (no hay eje de
// confianza/negocio detrás del texto, es solo la etiqueta del enum).
export const PET_STATUS_META: Record<PetStatus, { emoji: string; label: string; badgeClass: string; mapColor: string }> = {
  lost: { emoji: "🔴", label: "Perdida", badgeClass: "bg-danger/20 text-danger", mapColor: "#d84a3d" },
  sighted: { emoji: "🟡", label: "Avistada", badgeClass: "bg-warn/20 text-warn", mapColor: "#d99a2b" },
  sheltered: { emoji: "🔵", label: "Resguardada", badgeClass: "bg-accent/20 text-accent", mapColor: "#3b6fe0" },
  possible_match: { emoji: "🟣", label: "Posible coincidencia", badgeClass: "bg-accent/20 text-accent", mapColor: "#3b6fe0" },
  found: { emoji: "🟢", label: "Encontrada", badgeClass: "bg-safe/20 text-safe", mapColor: "#3f9d5e" },
  reunited: { emoji: "💚", label: "¡Reunida!", badgeClass: "bg-safe/20 text-safe", mapColor: "#3f9d5e" },
  needs_help: { emoji: "🆘", label: "Necesita ayuda", badgeClass: "bg-warn/20 text-warn", mapColor: "#d99a2b" },
  closed: { emoji: "⚪", label: "Cerrado", badgeClass: "bg-slate-500/20 text-slate-400", mapColor: "#8391a8" },
  outdated: { emoji: "⚪", label: "Desactualizado", badgeClass: "bg-slate-500/20 text-slate-400", mapColor: "#8391a8" },
};

export const PET_SPECIES_META: Record<PetSpecies, { emoji: string; label: string }> = {
  dog: { emoji: "🐕", label: "Perro" },
  cat: { emoji: "🐈", label: "Gato" },
  bird: { emoji: "🐦", label: "Ave" },
  rabbit: { emoji: "🐇", label: "Conejo" },
  horse: { emoji: "🐴", label: "Caballo" },
  other: { emoji: "🐾", label: "Mascota" },
};

export const PET_REPORT_TYPE_LABEL: Record<PetReportType, string> = {
  lost: "Perdida",
  found: "Encontrada",
  injured: "Herida",
  needs_help: "Necesita ayuda",
};

export const PET_HELP_CATEGORY_LABEL: Record<PetHelpCategory, string> = {
  veterinary: "Atención veterinaria",
  food: "Alimento",
  water: "Agua",
  transport: "Transporte",
  shelter: "Refugio temporal",
  rescue: "Rescate",
  other: "Otro",
};
