import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Moderation permissions (RBAC)", () => {
  const citizenEmail = `citizen-${randomUUID()}@aquiayudamosve.test`;
  const modEmail = `mod-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";

  let citizenToken: string;
  let modToken: string;

  beforeAll(async () => {
    const citizenRes = await request(app)
      .post("/api/auth/register")
      .send({ email: citizenEmail, password, displayName: "Citizen" });
    citizenToken = citizenRes.body.accessToken;

    const passwordHash = await bcrypt.hash(password, 12);
    const mod = await prisma.user.create({
      data: { email: modEmail, passwordHash, displayName: "Moderator", role: "moderator" },
    });
    await prisma.userReputation.create({ data: { userId: mod.id, level: "colaborador_confiable", score: 100 } });
    const modLogin = await request(app).post("/api/auth/login").send({ email: modEmail, password });
    modToken = modLogin.body.accessToken;
  });

  it("blocks a citizen from the flagged-reports admin endpoint", async () => {
    const res = await request(app)
      .get("/api/admin/reports/flagged")
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks an unauthenticated request entirely", async () => {
    const res = await request(app).get("/api/admin/reports/flagged");
    expect(res.status).toBe(401);
  });

  it("allows a moderator through", async () => {
    const res = await request(app)
      .get("/api/admin/reports/flagged")
      .set("Authorization", `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it("blocks a citizen from creating an organization", async () => {
    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ name: "Fundación X", type: "fundacion" });
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { in: [citizenEmail, modEmail] } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: [citizenEmail, modEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [citizenEmail, modEmail] } } });
    await prisma.$disconnect();
  });
});
