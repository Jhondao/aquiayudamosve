import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7),
  staleHoursThreshold: Number(process.env.STALE_HOURS_THRESHOLD ?? 6),
  isProd: (process.env.NODE_ENV ?? "development") === "production",
  // Only needed for the evidence-photo upload feature (Supabase Storage,
  // S3-compatible) — validated lazily in lib/objectStorage.ts so dev/tests
  // don't need storage credentials just to boot the app.
  storageEndpoint: process.env.STORAGE_ENDPOINT,
  storageRegion: process.env.STORAGE_REGION,
  storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  storageSecretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  storageBucket: process.env.STORAGE_BUCKET,
  storagePublicUrl: process.env.STORAGE_PUBLIC_URL,
  // Solo para notificaciones push — validado al usarse, no al arrancar
  // (ver lib/push.ts), así que dev/tests no necesitan tenerlas configuradas.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidContact: process.env.VAPID_CONTACT ?? "mailto:contacto@aquiayudamosve.org",
};
