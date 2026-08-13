import type { NeedStatus } from "../types";

// Solo estilo — el texto (needStatusLabel) siempre viene del backend.
export const NEED_STATUS_META: Record<NeedStatus, { emoji: string; badgeClass: string; mapColor: string }> = {
  necesitamos: { emoji: "🔴", badgeClass: "bg-danger/20 text-danger", mapColor: "#d84a3d" },
  en_camino: { emoji: "🟠", badgeClass: "bg-warn/20 text-warn", mapColor: "#d99a2b" },
  parcialmente_cubierto: { emoji: "🟡", badgeClass: "bg-warn/20 text-warn", mapColor: "#d99a2b" },
  cubierto: { emoji: "🟢", badgeClass: "bg-safe/20 text-safe", mapColor: "#3f9d5e" },
  excedente: { emoji: "🔵", badgeClass: "bg-accent/20 text-accent", mapColor: "#3b6fe0" },
  desactualizado: { emoji: "⚪", badgeClass: "bg-slate-500/20 text-slate-400", mapColor: "#8391a8" },
};
