import { PrismaClient } from "@prisma/client";

// Single shared instance — avoids exhausting MySQL connections under
// tsx watch's module reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
