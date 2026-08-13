import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { HttpError } from "../../middleware/errorHandler";
import { uploadObject } from "../../lib/objectStorage";

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

// A diferencia de reportes (foto = evidencia, un paso aparte tras crear),
// aquí la foto viaja en el mismo request que el resto del formulario — ver
// pets.schemas.ts. Mismo procesamiento que reports/uploads.ts:
// EXIF/GPS fuera antes de que la imagen salga del proceso.
export const uploadPetPhoto = upload.single("photo");

export async function persistPetPhoto(buffer: Buffer): Promise<string> {
  const key = `${randomUUID()}.jpg`;
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  return uploadObject(key, jpeg, "image/jpeg");
}
