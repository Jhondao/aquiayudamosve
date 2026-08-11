import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";

// Supabase Storage speaks the S3 protocol, so the AWS SDK v3 S3 client works
// as-is against its S3-compatible endpoint (https://<project-ref>.supabase.co/storage/v1/s3).
// Validated lazily (not at import time) since only the evidence-photo upload
// feature needs this — dev/tests shouldn't need storage credentials just to
// boot the app.
function storageClient(): S3Client {
  const { storageEndpoint, storageRegion, storageAccessKeyId, storageSecretAccessKey } = env;
  if (!storageEndpoint || !storageRegion || !storageAccessKeyId || !storageSecretAccessKey) {
    throw new Error(
      "STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY must be set to upload evidence photos."
    );
  }
  return new S3Client({
    region: storageRegion,
    endpoint: storageEndpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: storageAccessKeyId, secretAccessKey: storageSecretAccessKey },
  });
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!env.storageBucket || !env.storagePublicUrl) {
    throw new Error("STORAGE_BUCKET and STORAGE_PUBLIC_URL must be set to upload evidence photos.");
  }
  await storageClient().send(
    new PutObjectCommand({
      Bucket: env.storageBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=86400, immutable",
    })
  );
  return `${env.storagePublicUrl}/${key}`;
}
