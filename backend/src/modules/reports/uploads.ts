import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { HttpError } from "../../middleware/errorHandler";

export const UPLOADS_DIR = path.join(__dirname, "..", "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const FILENAME_RE = /^[a-f0-9-]{36}\.jpg$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpError(400, "Formato de imagen no permitido. Usa JPG, PNG o WEBP."));
    }
    cb(null, true);
  },
});

export const uploadEvidenceImage = upload.single("photo");

/**
 * Re-encodes every upload through sharp before it touches disk: this strips
 * EXIF (GPS, device, timestamps — section 7), normalizes the format so the
 * "photo" can't secretly be something else MIME-sniffed as an image, and
 * caps dimensions/size for slow connections (section 28). The random uuid
 * filename means nothing about the original name/path survives either.
 */
export async function persistEvidenceImage(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.jpg`;
  const outPath = path.join(UPLOADS_DIR, filename);
  await sharp(buffer)
    .rotate() // apply EXIF orientation before EXIF metadata is dropped
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(outPath);
  return filename;
}

const uploadsRouter = Router();

uploadsRouter.get("/:filename", (req, res) => {
  const { filename } = req.params;
  if (!FILENAME_RE.test(filename)) return res.status(404).json({ error: "No encontrado." });
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!filePath.startsWith(UPLOADS_DIR)) return res.status(404).json({ error: "No encontrado." });
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "No encontrado." });
  });
});

export default uploadsRouter;
