import type { TrustLevel } from "../types";

// Colored dot + explicit text label together (section 29: never color alone)
// and an icon-like glyph as a second, non-color channel.
const LEVEL_STYLE: Record<TrustLevel, { dot: string; glyph: string }> = {
  sin_verificar: { dot: "bg-slate-400", glyph: "○" },
  en_proceso: { dot: "bg-warn", glyph: "◐" },
  confirmado: { dot: "bg-safe", glyph: "✓" },
  institucional: { dot: "bg-accent", glyph: "◆" },
  desactualizada: { dot: "bg-slate-500", glyph: "◷" },
  cuestionada: { dot: "bg-danger", glyph: "!" },
};

export function TrustBadge({ level, label, compact }: { level: TrustLevel; label: string; compact?: boolean }) {
  const style = LEVEL_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"} font-semibold`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
      <span aria-hidden="true">{style.glyph}</span>
      <span>{label}</span>
    </span>
  );
}
