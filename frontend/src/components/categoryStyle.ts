import type { CategoryGroup } from "../types";

export const GROUP_META: Record<CategoryGroup, { label: string; badgeClass: string; markerColor: string }> = {
  ayuda: { label: "Ayuda disponible", badgeClass: "bg-safe/20 text-safe", markerColor: "#3f9d5e" },
  necesidad: { label: "Necesidad de ayuda", badgeClass: "bg-warn/20 text-warn", markerColor: "#d99a2b" },
  critico: { label: "Punto crítico", badgeClass: "bg-danger/20 text-danger", markerColor: "#d84a3d" },
  info: { label: "Información institucional", badgeClass: "bg-accent/20 text-accent", markerColor: "#3b6fe0" },
};
