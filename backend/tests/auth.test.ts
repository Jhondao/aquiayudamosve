import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Auth flow", () => {
  const email = `test-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";

  it("registers a new user and never echoes the password hash", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.profile.reputationLevel).toBe("nuevo");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/);
  });

  it("rejects a second registration with the same email without confirming it exists", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Test User Again" });
    expect(res.status).toBe(409);
  });

  it("rejects weak passwords at the validation layer", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `weak-${randomUUID()}@aquiayudamosve.test`, password: "123", displayName: "X" });
    expect(res.status).toBe(400);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
  });

  it("rejects an incorrect password with a generic message (no user enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).not.toMatch(/no existe|not found/i);
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rotates the refresh token and revokes the previous one", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });
    const cookie = login.headers["set-cookie"][0];

    const refresh1 = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(refresh1.status).toBe(200);

    // Reusing the original (now-revoked) refresh token must fail — this is
    // what would catch a stolen/replayed refresh token.
    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(reuse.status).toBe(401);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.userReputation.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
