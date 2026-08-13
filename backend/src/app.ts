import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimit";

import authRoutes from "./modules/auth/auth.routes";
import categoriesRoutes from "./modules/categories/categories.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import moderationRoutes from "./modules/moderation/moderation.routes";
import organizationsRoutes from "./modules/organizations/organizations.routes";
import usersRoutes from "./modules/users/users.routes";
import pushRoutes from "./modules/push/push.routes";
import shareGatewayRoutes from "./modules/share/shareGateway.routes";
import petsRoutes from "./modules/pets/pets.routes";
import petModerationRoutes from "./modules/pets/petModeration.routes";
import petShareGatewayRoutes from "./modules/pets/petShareGateway.routes";

export function createApp() {
  const app = express();

  // Trust the first proxy hop only (relevant once deployed behind a reverse
  // proxy / load balancer) so req.ip and rate limiting key off the real client.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // *.supabase.co: fotos de evidencia y piezas de compartir, ambas
          // servidas desde el bucket público de Supabase Storage
          // (STORAGE_PUBLIC_URL) — sin esto el navegador bloquea esos <img>
          // en producción aunque la URL sea válida y pública.
          imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://*.supabase.co"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          // googletagmanager.com: carga gtag.js (Google Analytics). El script
          // de inicialización va en /gtag-init.js (mismo origen, ver
          // frontend/public/) en vez de inline — así no hace falta
          // 'unsafe-inline' para nada de script.
          scriptSrc: ["'self'", "https://www.googletagmanager.com"],
          // google-analytics.com: envío de hits de gtag.js (fetch/beacon).
          connectSrc: ["'self'", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://www.googletagmanager.com"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(authenticate);
  app.use(generalLimiter);

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/admin", moderationRoutes);
  app.use("/api/admin/pets", petModerationRoutes);
  app.use("/api/organizations", organizationsRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/push", pushRoutes);
  app.use("/api/pets", petsRoutes);

  // Fuera de /api a propósito: responde HTML (puerta social con OG tags),
  // no JSON. Ver shareGateway.routes.ts / petShareGateway.routes.ts. La ruta
  // de mascotas tiene 2 segmentos (/r/mascota/:id), nunca colisiona con la
  // de reportes (/r/:id, que solo matchea un segmento).
  app.use("/r/mascota", petShareGatewayRoutes);
  app.use("/r", shareGatewayRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
