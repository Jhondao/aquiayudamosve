import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { uploadObject } from "../../lib/objectStorage";
import { HttpError } from "../../middleware/errorHandler";
import { box, qrDataUri, renderCardPng, truncate, type CardNode } from "../../lib/cardRenderer";
import type { ShareChannelValue } from "../share/share.schemas";
import type { PetReportTypeValue, PetSpeciesValue } from "./pets.schemas";

export type PetShareStatus = "lost" | "found" | "reunited" | "needs_help";

// A diferencia de reportes (donde solo estados de confianza alta generan
// imagen — "nunca glamorizar lo no confirmado"), mascotas no tiene eje de
// confianza en Fase 1 en absoluto, así que no hay nada de eso que filtrar:
// los 4 estados siempre generan pieza visual.

const COLORS = {
  ink: "#111318",
  surface: "#1b1e26",
  surface2: "#242832",
  accent: "#3b6fe0",
  danger: "#d84a3d",
  safe: "#3f9d5e",
  warn: "#d99a2b",
  brand: "#4beb9b",
  textMuted: "#9aa3b5",
} as const;

const BADGE_STYLE: Record<PetShareStatus, { label: string; color: string }> = {
  lost: { label: "MASCOTA PERDIDA", color: COLORS.danger },
  found: { label: "MASCOTA ENCONTRADA", color: COLORS.accent },
  needs_help: { label: "NECESITA AYUDA", color: COLORS.warn },
  reunited: { label: "YA VOLVIÓ A CASA", color: COLORS.safe },
};

const SPECIES_LABEL: Record<PetSpeciesValue, string> = {
  dog: "Perro",
  cat: "Gato",
  bird: "Ave",
  rabbit: "Conejo",
  horse: "Caballo",
  other: "Mascota",
};

export function determinePetShareStatus(pet: { reportType: PetReportTypeValue; status: string }): PetShareStatus {
  if (pet.status === "reunited") return "reunited";
  if (pet.reportType === "lost") return "lost";
  if (pet.reportType === "found") return "found";
  return "needs_help";
}

interface CardData {
  status: PetShareStatus;
  speciesLabel: string;
  title: string;
  detailLine: string;
  locationLine: string;
  qrDataUri: string;
  shortUrlLabel: string;
}

function buildCardTree(data: CardData): CardNode {
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
      box({ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, [
        box({ fontSize: 30, fontWeight: 700, color: COLORS.brand }, "AquíAyudamos, VE"),
        box(
          { backgroundColor: badge.color, color: COLORS.ink, fontSize: 22, fontWeight: 700, padding: "10px 20px", borderRadius: 999 },
          badge.label
        ),
      ]),

      box(
        { marginTop: 40, backgroundColor: COLORS.surface2, color: COLORS.textMuted, fontSize: 24, fontWeight: 700, padding: "8px 18px", borderRadius: 8, alignSelf: "flex-start" },
        data.speciesLabel.toUpperCase()
      ),

      box({ marginTop: 24, fontSize: 56, fontWeight: 700, lineHeight: 1.15, color: "#ffffff" }, truncate(data.title, 90)),

      box({ marginTop: 20, fontSize: 30, color: COLORS.textMuted }, data.locationLine),

      box({ marginTop: 24, fontSize: 28, lineHeight: 1.4, color: COLORS.textMuted }, truncate(data.detailLine, 220)),

      box({ flexGrow: 1 }),

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

function buildCopy(pet: PetShareableRow, status: PetShareStatus, url: string): string {
  const species = SPECIES_LABEL[pet.species];
  const name = pet.name ? `"${pet.name}"` : `Un(a) ${species.toLowerCase()}`;
  const locationLine = `${pet.municipalityName}, ${pet.departmentName}`;
  switch (status) {
    case "lost":
      return `🐾 ${name} se perdió en ${locationLine}. Si la has visto, revisa el reporte y ayúdanos a compartirlo: ${url}`;
    case "found":
      return `🐾 Encontramos a ${name.toLowerCase()} en ${locationLine}. Si conoces a su familia, comparte este reporte: ${url}`;
    case "needs_help":
      return `🐾 ${name} necesita ayuda en ${locationLine}. Revisa qué tipo de ayuda hace falta: ${url}`;
    case "reunited":
      return `🐾 ¡Qué buena noticia! ${name} ya volvió a casa. Gracias a quienes compartieron y ayudaron. — ${url}`;
  }
}

interface PetShareableRow {
  id: string;
  reportType: PetReportTypeValue;
  species: PetSpeciesValue;
  name: string | null;
  breed: string | null;
  primaryColor: string | null;
  distinctiveFeatures: string | null;
  status: string;
  departmentName: string;
  municipalityName: string;
  helpCategory: string | null;
  deletedAt: Date | null;
  hidden: boolean;
  updatedAt: Date;
}

async function loadShareablePet(petReportId: string): Promise<PetShareableRow> {
  const pet = await prisma.petReport.findUnique({ where: { id: petReportId } });
  // Igual que con reportes: un registro oculto por moderación se trata como
  // inexistente para compartir — nunca generar pieza ni texto a partir de
  // contenido que un moderador ya retiró.
  if (!pet || pet.deletedAt || pet.hidden) {
    throw new HttpError(404, "Reporte de mascota no encontrado.");
  }
  return pet;
}

function shareUrl(petReportId: string): string {
  return `${env.corsOrigin}/r/mascota/${petReportId}`;
}

interface PetShareCardResult {
  imageUrl: string | null;
  shareUrl: string;
  whatsappText: string;
  status: PetShareStatus;
}

// Igual patrón que reportes: Map en memoria por proceso, invalidado cuando
// cambia algo relevante (status/updatedAt), nunca por tiempo fijo.
const cardCache = new Map<string, { cacheKey: string; result: PetShareCardResult }>();

function cacheKeyFor(pet: PetShareableRow): string {
  return [pet.status, pet.updatedAt.getTime()].join("|");
}

function detailLineFor(pet: PetShareableRow): string {
  const parts = [pet.breed, pet.primaryColor].filter(Boolean);
  if (pet.distinctiveFeatures) parts.push(pet.distinctiveFeatures);
  return parts.length > 0 ? parts.join(" · ") : "Consulta el reporte para más detalles.";
}

export async function getOrCreatePetShareCard(petReportId: string): Promise<PetShareCardResult> {
  const pet = await loadShareablePet(petReportId);
  const status = determinePetShareStatus(pet);
  const url = shareUrl(petReportId);
  const whatsappText = buildCopy(pet, status, url);

  const cacheKey = cacheKeyFor(pet);
  const cached = cardCache.get(petReportId);
  if (cached && cached.cacheKey === cacheKey) return cached.result;

  const speciesLabel = SPECIES_LABEL[pet.species];
  const title = pet.name ? pet.name : `${speciesLabel} ${status === "lost" ? "perdido/a" : "sin nombre"}`;

  const png = await renderCardPng(
    buildCardTree({
      status,
      speciesLabel,
      title,
      detailLine: detailLineFor(pet),
      locationLine: `${pet.municipalityName}, ${pet.departmentName}`,
      shortUrlLabel: url.replace(/^https?:\/\//, ""),
      qrDataUri: await qrDataUri(url),
    }),
    1080,
    1350
  );
  const hash = cacheKey.replace(/[^a-zA-Z0-9]/g, "").slice(-16);
  const imageUrl = await uploadObject(`pet-cards/${petReportId}-${hash}.png`, png, "image/png");

  const result: PetShareCardResult = { imageUrl, shareUrl: url, whatsappText, status };
  cardCache.set(petReportId, { cacheKey, result });
  return result;
}

export async function recordPetShareEvent(petReportId: string, userId: string | undefined, channel: ShareChannelValue): Promise<void> {
  // Best-effort, nunca bloquea la UI — mismo criterio que broadcastPush.
  try {
    await prisma.petReport.findUniqueOrThrow({ where: { id: petReportId } });
    await prisma.petShareEvent.create({ data: { petReportId, userId, channel } });
  } catch {
    // silencioso a propósito
  }
}

export async function getPublicPetPreview(petReportId: string): Promise<{
  title: string;
  description: string;
  imageUrl: string | null;
  available: boolean;
}> {
  try {
    const card = await getOrCreatePetShareCard(petReportId);
    const pet = await prisma.petReport.findUniqueOrThrow({ where: { id: petReportId } });
    const speciesLabel = SPECIES_LABEL[pet.species as PetSpeciesValue];
    const title = pet.name ?? `${speciesLabel} — ${BADGE_STYLE[card.status].label}`;
    return { title, description: card.whatsappText, imageUrl: card.imageUrl, available: true };
  } catch {
    return { title: "AquíAyudamos, VE", description: "Contenido no disponible.", imageUrl: null, available: false };
  }
}
