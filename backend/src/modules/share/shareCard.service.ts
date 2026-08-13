import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import QRCode from "qrcode";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { uploadObject } from "../../lib/objectStorage";
import { HttpError } from "../../middleware/errorHandler";
import { applyDecay, determineTrustLevel, type TrustLevel } from "../trust/trustScore.service";
import { needStatusLabels } from "../reports/reports.schemas";
import type { ShareChannelValue } from "./share.schemas";

export type ShareStatus = "confirmed" | "institutional" | "covered" | "surplus" | "questioned" | "unconfirmed";

// Solo estos 4 estados generan una pieza visual — el resto es enlace +
// advertencia en texto plano (sección "Nunca 100% verificado" del documento:
// esta función es justamente "compartir reportes CONFIRMADOS", no cualquiera).
const IMAGE_ELIGIBLE: ReadonlySet<ShareStatus> = new Set(["confirmed", "institutional", "covered", "surplus"]);

const COLORS = {
  ink: "#111318",
  surface: "#1b1e26",
  surface2: "#242832",
  border: "#333846",
  accent: "#3b6fe0",
  danger: "#d84a3d",
  safe: "#3f9d5e",
  warn: "#d99a2b",
  brand: "#4beb9b",
  textMuted: "#9aa3b5",
} as const;

const BADGE_STYLE: Record<ShareStatus, { label: string; color: string }> = {
  confirmed: { label: "CONFIRMADO POR LA COMUNIDAD", color: COLORS.safe },
  institutional: { label: "FUENTE INSTITUCIONAL", color: COLORS.accent },
  covered: { label: "CUBIERTO — NO TRAER MÁS", color: COLORS.safe },
  surplus: { label: "EXCEDENTE DISPONIBLE", color: COLORS.brand },
  questioned: { label: "INFORMACIÓN CUESTIONADA", color: COLORS.danger },
  unconfirmed: { label: "AÚN SIN CONFIRMAR", color: COLORS.warn },
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// --- Fuentes (satori vectoriza el texto con las que le pasemos — nunca
// depende de qué tenga instalado el contenedor, y nunca usamos glyphs que
// puedan faltar en Inter: sin emoji, sin símbolos tipo ✓/◆/○). ---
const FONTS_DIR = path.join(__dirname, "../../../assets/fonts");
let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(FONTS_DIR, "Inter-Regular.ttf")),
      readFile(path.join(FONTS_DIR, "Inter-Bold.ttf")),
    ]).then(([regular, bold]) => [
      { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
      { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
    ]);
  }
  return fontsPromise;
}

type Node = { type: string; props: Record<string, unknown> };

function box(style: Record<string, unknown>, children?: Node | Node[] | string): Node {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

interface CardData {
  categoryLabel: string;
  title: string;
  description: string;
  locationLine: string;
  status: ShareStatus;
  needLine: string | null;
  qrDataUri: string;
  shortUrlLabel: string;
}

function buildCardTree(data: CardData): Node {
  const badge = BADGE_STYLE[data.status];

  return box(
    {
      width: 1080,
      height: 1350,
      flexDirection: "column",
      backgroundColor: COLORS.ink,
      padding: 64,
      fontFamily: "Inter",
      color: "#ffffff",
    },
    [
      // Header: wordmark + status badge
      box({ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, [
        box({ fontSize: 30, fontWeight: 700, color: COLORS.brand }, "AquíAyudamos, VE"),
        box(
          {
            backgroundColor: badge.color,
            color: COLORS.ink,
            fontSize: 22,
            fontWeight: 700,
            padding: "10px 20px",
            borderRadius: 999,
          },
          badge.label
        ),
      ]),

      // Category chip
      box(
        {
          marginTop: 40,
          backgroundColor: COLORS.surface2,
          color: COLORS.textMuted,
          fontSize: 24,
          fontWeight: 700,
          padding: "8px 18px",
          borderRadius: 8,
          alignSelf: "flex-start",
        },
        data.categoryLabel.toUpperCase()
      ),

      // Title
      box(
        { marginTop: 24, fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#ffffff" },
        truncate(data.title, 90)
      ),

      // Location
      box({ marginTop: 20, fontSize: 30, color: COLORS.textMuted }, data.locationLine),

      // Description
      box(
        { marginTop: 24, fontSize: 28, lineHeight: 1.4, color: COLORS.textMuted },
        truncate(data.description, 220)
      ),

      // Spacer
      box({ flexGrow: 1 }),

      // Need line (quantities / covered-surplus message), only when relevant
      ...(data.needLine
        ? [
            box(
              {
                marginBottom: 32,
                backgroundColor: COLORS.surface,
                borderRadius: 16,
                padding: 28,
                fontSize: 30,
                fontWeight: 700,
                color: "#ffffff",
              },
              data.needLine
            ),
          ]
        : []),

      // Footer: QR + short link
      box({ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, [
        box({ flexDirection: "column", maxWidth: 780 }, [
          box({ fontSize: 24, color: COLORS.textMuted }, "Consulta el estado actualizado:"),
          box({ marginTop: 6, fontSize: 28, fontWeight: 700, color: "#ffffff" }, data.shortUrlLabel),
        ]),
        { type: "img", props: { src: data.qrDataUri, width: 160, height: 160, style: { borderRadius: 12 } } },
      ]),
    ]
  );
}

export function determineShareStatus(report: {
  status: "active" | "inactive" | "hidden";
  trustLevel: TrustLevel;
  needStatus: string | null;
}): ShareStatus {
  if (report.trustLevel === "cuestionada") return "questioned";
  if (report.status === "inactive") return "unconfirmed";
  if (report.needStatus === "cubierto") return "covered";
  if (report.needStatus === "excedente") return "surplus";
  if (report.trustLevel === "institucional") return "institutional";
  if (report.trustLevel === "confirmado") return "confirmed";
  return "unconfirmed";
}

function buildCopy(params: {
  status: ShareStatus;
  title: string;
  locationLine: string;
  shareUrl: string;
}): string {
  const { status, title, locationLine, shareUrl } = params;
  switch (status) {
    case "confirmed":
      return `"${title}" está confirmado por la comunidad en ${locationLine}. Consulta el estado actualizado antes de moverte: ${shareUrl}`;
    case "institutional":
      return `"${title}" viene de una fuente institucional verificada en ${locationLine}. Consulta el estado actualizado: ${shareUrl}`;
    case "covered":
      return `¡Gracias, comunidad! "${title}" ya está cubierto — no hace falta traer más por ahora (${locationLine}). Consulta el estado actualizado: ${shareUrl}`;
    case "surplus":
      return `"${title}" tiene excedente disponible en ${locationLine} — puede redirigirse a otro punto. Consulta el estado actualizado: ${shareUrl}`;
    case "questioned":
      return `La información de "${title}" está cuestionada por la comunidad. Revisa el estado actualizado antes de actuar: ${shareUrl}`;
    default:
      return `"${title}" (${locationLine}) todavía no ha sido confirmado por la comunidad. Revisa el estado actualizado antes de actuar: ${shareUrl}`;
  }
}

interface ShareableReportRow {
  id: string;
  title: string;
  description: string;
  departmentName: string;
  municipalityName: string;
  status: "active" | "inactive" | "hidden";
  deletedAt: Date | null;
  trustScore: number;
  lastConfirmedAt: Date;
  updatedAt: Date;
  organizationId: string | null;
  needStatus: string | null;
  quantityNeeded: number | null;
  quantityUnit: string | null;
  quantityReceived: number;
  category: { label: string };
  confirmations: { type: string }[];
  flags: { id: string }[];
}

async function loadShareableReport(reportId: string): Promise<ShareableReportRow> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      category: { select: { label: true } },
      confirmations: { select: { type: true } },
      flags: { where: { resolved: false }, select: { id: true } },
    },
  });
  // Un reporte oculto por moderación se trata como inexistente para esta
  // función a propósito — no debe ser posible generar ni una pieza visual ni
  // texto de WhatsApp a partir de contenido que un moderador ya retiró.
  if (!report || report.deletedAt || report.status === "hidden") {
    throw new HttpError(404, "Reporte no encontrado.");
  }
  return report;
}

function shareUrl(reportId: string): string {
  return `${env.corsOrigin}/r/${reportId}`;
}

interface ShareCardResult {
  imageUrl: string | null;
  shareUrl: string;
  whatsappText: string;
  status: ShareStatus;
}

// Cache en memoria por proceso (Render corre una sola instancia, sin infra
// nueva) — se invalida solo cuando cambia algo relevante para la pieza
// (confirmaciones/estado/decaimiento de confianza), nunca por tiempo fijo.
const cardCache = new Map<string, { cacheKey: string; result: ShareCardResult }>();

function cacheKeyFor(report: ShareableReportRow, trustLevel: TrustLevel): string {
  return [report.lastConfirmedAt.getTime(), report.needStatus, trustLevel, report.updatedAt.getTime()].join("|");
}

export async function getOrCreateShareCard(reportId: string): Promise<ShareCardResult> {
  const report = await loadShareableReport(reportId);
  const displayScore = applyDecay(report.trustScore, report.lastConfirmedAt);
  const incorrectCount = report.flags.length + report.confirmations.filter((c) => c.type === "incorrect").length;
  const trustLevel = determineTrustLevel({
    score: displayScore,
    lastConfirmedAt: report.lastConfirmedAt,
    isOrgBacked: report.organizationId != null,
    incorrectCount,
  });
  const status = determineShareStatus({ status: report.status, trustLevel, needStatus: report.needStatus });
  const url = shareUrl(reportId);
  const locationLine = `${report.municipalityName}, ${report.departmentName}`;
  const whatsappText = buildCopy({ status, title: report.title, locationLine, shareUrl: url });

  if (!IMAGE_ELIGIBLE.has(status)) {
    return { imageUrl: null, shareUrl: url, whatsappText, status };
  }

  const cacheKey = cacheKeyFor(report, trustLevel);
  const cached = cardCache.get(reportId);
  if (cached && cached.cacheKey === cacheKey) return cached.result;

  const imageUrl = await renderAndUploadCard(reportId, cacheKey, {
    categoryLabel: report.category.label,
    title: report.title,
    description: report.description,
    locationLine,
    status,
    needLine: buildNeedLine(status, report),
    shortUrlLabel: url.replace(/^https?:\/\//, ""),
    qrDataUri: await qrDataUri(url),
  });

  const result: ShareCardResult = { imageUrl, shareUrl: url, whatsappText, status };
  cardCache.set(reportId, { cacheKey, result });
  return result;
}

function buildNeedLine(status: ShareStatus, report: ShareableReportRow): string | null {
  if (status === "covered") return "Ya no hace falta traer más de esto — gracias por confirmar.";
  if (status === "surplus") return "Hay excedente: considera llevarlo a otro punto que lo necesite.";
  if (report.quantityNeeded != null) {
    const unit = report.quantityUnit ?? "";
    return `Necesitan ${report.quantityNeeded}${unit} · Recibido ${report.quantityReceived}${unit}`;
  }
  return null;
}

async function qrDataUri(url: string): Promise<string> {
  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: 320,
    margin: 1,
    color: { dark: "#111318ff", light: "#ffffffff" },
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function renderAndUploadCard(reportId: string, cacheKey: string, data: CardData): Promise<string> {
  const fonts = await loadFonts();
  const svg = await satori(buildCardTree(data) as never, { width: 1080, height: 1350, fonts });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const hash = cacheKey.replace(/[^a-zA-Z0-9]/g, "").slice(-16);
  const key = `share-cards/${reportId}-${hash}.png`;
  return uploadObject(key, png, "image/png");
}

export async function recordShareEvent(reportId: string, userId: string | undefined, channel: ShareChannelValue): Promise<void> {
  // Best-effort, nunca bloquea la UI (mismo criterio que broadcastPush) — es
  // solo telemetría de qué canal se usó, nunca destinatarios ni números.
  try {
    await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    await prisma.shareEvent.create({ data: { reportId, userId, channel } });
  } catch {
    // silencioso a propósito
  }
}

export async function getPublicPreview(reportId: string): Promise<{
  title: string;
  description: string;
  imageUrl: string | null;
  available: boolean;
}> {
  try {
    const card = await getOrCreateShareCard(reportId);
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    return { title: report.title, description: report.description, imageUrl: card.imageUrl, available: true };
  } catch {
    return { title: "AquíAyudamos, VE", description: "Contenido no disponible.", imageUrl: null, available: false };
  }
}
