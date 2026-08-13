import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("NeedCommitment — compromisos de ayuda", () => {
  const ownerEmail = `commit-owner-${randomUUID()}@aquiayudamosve.test`;
  const otherEmail = `commit-other-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";

  let ownerToken: string;
  let otherToken: string;
  let reportId: string;
  let commitmentId: string;
  let createdCategoryId: string | null = null;

  beforeAll(async () => {
    const ownerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: ownerEmail, password, displayName: "Commitment Owner" });
    ownerToken = ownerRes.body.accessToken;

    const otherRes = await request(app)
      .post("/api/auth/register")
      .send({ email: otherEmail, password, displayName: "Commitment Other" });
    otherToken = otherRes.body.accessToken;

    let category = await prisma.reportCategory.findFirst({ where: { group: "necesidad" } });
    if (!category) {
      category = await prisma.reportCategory.create({
        data: { group: "necesidad", key: `necesidad-test-${randomUUID()}`, label: "Necesidad de prueba" },
      });
      createdCategoryId = category.id;
    }

    const reportRes = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        categoryKey: category.key,
        title: "Necesitamos agua — prueba de compromisos",
        description: "Reporte creado por needCommitment.test.ts",
        departmentName: "Valle del Cauca",
        municipalityName: "Cali",
        locationSource: "manual",
        lat: 3.4516,
        lng: -76.532,
      });
    reportId = reportRes.body.id;
  });

  it("creates an 'on_the_way' commitment and bumps needStatus to en_camino", async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/commitments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 20, unit: "L", status: "on_the_way", transportMethod: "moto" });

    expect(res.status).toBe(201);
    expect(res.body.needStatus).toBe("en_camino");
    expect(res.body.needCommitments).toHaveLength(1);
    expect(res.body.needCommitments[0].mine).toBe(true);
    commitmentId = res.body.needCommitments[0].id;
  });

  it("never exposes the real userId — other viewers see mine: false for the same commitment", async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.needCommitments[0].mine).toBe(false);
    expect(res.body.needCommitments[0].userId).toBeUndefined();
  });

  it("blocks a different user from updating someone else's commitment", async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/commitments/${commitmentId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ status: "delivered" });

    expect(res.status).toBe(403);
  });

  it("blocks an unauthenticated update entirely", async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/commitments/${commitmentId}`)
      .send({ status: "delivered" });

    expect(res.status).toBe(401);
  });

  it("allows the owner to update their own commitment to delivered", async () => {
    const res = await request(app)
      .patch(`/api/reports/${reportId}/commitments/${commitmentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.needCommitments[0].status).toBe("delivered");
    expect(res.body.needCommitments[0].mine).toBe(true);
  });

  afterAll(async () => {
    await prisma.needCommitment.deleteMany({ where: { reportId } });
    await prisma.report.deleteMany({ where: { id: reportId } });
    if (createdCategoryId) await prisma.reportCategory.deleteMany({ where: { id: createdCategoryId } });
    await prisma.session.deleteMany({ where: { user: { email: { in: [ownerEmail, otherEmail] } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: [ownerEmail, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
    await prisma.$disconnect();
  });
});
