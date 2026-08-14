import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import QRCode from "qrcode";

// Primitivas genéricas para generar piezas visuales (reportes confirmados,
// mascotas) — satori vectoriza el texto con las fuentes que le pasemos
// (nunca depende de qué tenga instalado el contenedor, y evita glyphs que
// puedan faltar en Inter: sin emoji, sin símbolos tipo ✓/◆/○), sharp solo
// rasteriza el SVG final a PNG. El contenido/copy de cada tipo de pieza
// vive en su propio módulo (shareCard.service.ts, petShareCard.service.ts),
// esto solo tiene el motor de render.

// Este archivo vive en backend/src/lib/ (2 niveles bajo backend/) — a
// diferencia de backend/src/modules/share/ (3 niveles), así que la ruta a
// assets/fonts tiene un "../" menos.
const FONTS_DIR = path.join(__dirname, "../../assets/fonts");
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

export type CardNode = { type: string; props: Record<string, unknown> };

export function box(style: Record<string, unknown>, children?: CardNode | CardNode[] | string): CardNode {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function qrDataUri(url: string): Promise<string> {
  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: 320,
    margin: 1,
    color: { dark: "#111318ff", light: "#ffffffff" },
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function renderCardPng(tree: CardNode, width: number, height: number): Promise<Buffer> {
  const fonts = await loadFonts();
  const svg = await satori(tree as never, { width, height, fonts });
  return sharp(Buffer.from(svg)).png().toBuffer();
}
