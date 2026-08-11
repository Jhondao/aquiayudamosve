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
          imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
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
  app.use("/api/organizations", organizationsRoutes);
  app.use("/api/users", usersRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
