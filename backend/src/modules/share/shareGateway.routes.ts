import { Router } from "express";
import { env } from "../../config/env";
import { getPublicPreview } from "./shareCard.service";

const router = Router();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Puerta social: la ven bots de WhatsApp/Telegram/Facebook (no ejecutan JS ni
// siguen meta-refresh, solo leen las meta tags estáticas) y, brevemente,
// navegadores reales antes del meta-refresh instantáneo. Fuera de /api a
// propósito — responde HTML, no JSON. Sin <script> inline: choca con la CSP
// scriptSrc: ["'self'"] ya existente en app.ts, y el meta-refresh a 0 ya es
// instantáneo en cualquier navegador real, así que un fallback JS no hace falta.
router.get("/:id", async (req, res) => {
  const preview = await getPublicPreview(req.params.id);
  const targetPath = `/reporte/${encodeURIComponent(req.params.id)}`;
  const targetUrl = `${env.corsOrigin}${targetPath}`;
  const title = escapeHtml(preview.available ? preview.title : "AquíAyudamos, VE");
  const description = escapeHtml(
    preview.available ? preview.description.slice(0, 300) : "Este contenido no está disponible."
  );
  const image = preview.imageUrl;

  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title} — AquíAyudamos, VE</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(targetUrl)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta property="og:image:width" content="1080">\n<meta property="og:image:height" content="1350">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
<meta http-equiv="refresh" content="0;url=${escapeHtml(targetPath)}">
</head>
<body>
<p>Redirigiendo a <a href="${escapeHtml(targetPath)}">${title}</a>…</p>
</body>
</html>`);
});

export default router;
