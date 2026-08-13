import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { determineShareStatus } from "../src/modules/share/shareCard.service";

const app = createApp();

describe("determineShareStatus — pure classification", () => {
  it("classifies a disputed report as questioned regardless of everything else", () => {
    expect(determineShareStatus({ status: "active", trustLevel: "cuestionada", needStatus: "cubierto" })).toBe(
      "questioned"
    );
  });

  it("forces inactive reports to unconfirmed even if trust is high", () => {
    expect(determineShareStatus({ status: "inactive", trustLevel: "confirmado", needStatus: null })).toBe(
      "unconfirmed"
    );
  });

  it("covered/surplus needStatus wins over trust level", () => {
    expect(determineShareStatus({ status: "active", trustLevel: "sin_verificar", needStatus: "cubierto" })).toBe(
      "covered"
    );
    expect(determineShareStatus({ status: "active", trustLevel: "sin_verificar", needStatus: "excedente" })).toBe(
      "surplus"
    );
  });

  it("falls back to trust level when there's no relevant needStatus", () => {
    expect(determineShareStatus({ status: "active", trustLevel: "institucional", needStatus: null })).toBe(
      "institutional"
    );
    expect(determineShareStatus({ status: "active", trustLevel: "confirmado", needStatus: "necesitamos" })).toBe(
      "confirmed"
    );
  });

  it("defaults to unconfirmed for a fresh report", () => {
    expect(determineShareStatus({ status: "active", trustLevel: "sin_verificar", needStatus: null })).toBe(
      "unconfirmed"
    );
  });
});

describe("Share endpoints", () => {
  const email = `share-test-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let token: string;
  let reportId: string;

  beforeAll(async () => {
    const authRes = await request(app).post("/api/auth/register").send({ email, password, displayName: "Share Tester" });
    token = authRes.body.accessToken;

    const category = await prisma.reportCategory.findFirstOrThrow({ where: { group: "ayuda" } });
    const reportRes = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${token}`)
      .send({
        categoryKey: category.key,
        title: "Reporte de prueba para compartir",
        description: "Creado por share.test.ts",
        departmentName: "Valle del Cauca",
        municipalityName: "Cali",
        locationSource: "manual",
        lat: 3.4516,
        lng: -76.532,
      });
    reportId = reportRes.body.id;
  });

  it("GET /:id/share-card on a fresh report returns no image and an unconfirmed warning", async () => {
    const res = await request(app).get(`/api/reports/${reportId}/share-card`);
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeNull();
    expect(res.body.status).toBe("unconfirmed");
    expect(res.body.shareUrl).toContain(`/r/${reportId}`);
    expect(typeof res.body.whatsappText).toBe("string");
    expect(res.body.whatsappText.length).toBeGreaterThan(0);
  });

  it("GET /:id/share-card on a nonexistent report is a 404", async () => {
    const res = await request(app).get(`/api/reports/${randomUUID()}/share-card`);
    expect(res.status).toBe(404);
  });

  it("POST /:id/share-event records telemetry without requiring auth", async () => {
    const res = await request(app).post(`/api/reports/${reportId}/share-event`).send({ channel: "whatsapp" });
    expect(res.status).toBe(202);

    const events = await prisma.shareEvent.findMany({ where: { reportId } });
    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("whatsapp");
    expect(events[0].userId).toBeNull();
  });

  it("POST /:id/share-event rejects an invalid channel", async () => {
    const res = await request(app).post(`/api/reports/${reportId}/share-event`).send({ channel: "carrier_pigeon" });
    expect(res.status).toBe(400);
  });

  it("GET /r/:id serves an HTML gateway with real OG tags for a fresh (non-hidden) report", async () => {
    const res = await request(app).get(`/r/${reportId}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Reporte de prueba para compartir");
    expect(res.text).toContain(`og:url" content="`);
    expect(res.text).toContain(`meta http-equiv="refresh"`);
    expect(res.text).not.toContain("og:image");
  });

  it("GET /r/:id degrades gracefully (200, generic fallback) for a nonexistent report", async () => {
    const res = await request(app).get(`/r/${randomUUID()}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("no está disponible");
  });

  afterAll(async () => {
    await prisma.shareEvent.deleteMany({ where: { reportId } });
    await prisma.report.deleteMany({ where: { id: reportId } });
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.userReputation.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
