import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

// Cloudflare R2 is S3-compatible, so the AWS SDK v3 S3 client works as-is
// against R2's account-scoped endpoint. Validated lazily (not at import
// time) since only the evidence-photo upload feature needs R2 — dev/tests
// shouldn't need R2 credentials just to boot the app.
function r2Client(): S3Client {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = env;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set to upload evidence photos."
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  });
}

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!env.r2Bucket || !env.r2PublicUrl) {
    throw new Error("R2_BUCKET and R2_PUBLIC_URL must be set to upload evidence photos.");
  }
  await r2Client().send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=86400, immutable",
    })
  );
  return `${env.r2PublicUrl}/${key}`;
}
