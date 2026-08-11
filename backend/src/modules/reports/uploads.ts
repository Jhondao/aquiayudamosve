import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { HttpError } from "../../middleware/errorHandler";
import { uploadToR2 } from "../../lib/r2";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

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
 * Re-encodes every upload through sharp before it leaves the process: this
 * strips EXIF (GPS, device, timestamps — section 7), normalizes the format
 * so the "photo" can't secretly be something else MIME-sniffed as an image,
 * and caps dimensions/size for slow connections (section 28). The random
 * uuid key means nothing about the original name/path survives either.
 * Returns the public R2 URL to store as the evidence's imageUrl.
 */
export async function persistEvidenceImage(buffer: Buffer): Promise<string> {
  const key = `${randomUUID()}.jpg`;
  const jpeg = await sharp(buffer)
    .rotate() // apply EXIF orientation before EXIF metadata is dropped
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  return uploadToR2(key, jpeg, "image/jpeg");
}
