import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

// Publicar un reporte sin cuenta pedía correo Y celular juntos — se relajó
// a "nombre + (correo o celular)" para igualar el resto de la app
// (confirmar, mascotas), que nunca exige los dos. Bug real reportado por un
// usuario: con solo uno de los dos dados, el formulario nunca dejaba
// publicar y el mensaje de error no explicaba por qué.
describe("Publicar un reporte sin cuenta — correo o celular, no ambos", () => {
  let categoryKey: string;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const category = await prisma.reportCategory.findFirstOrThrow({ where: { group: "ayuda" } });
    categoryKey = category.key;
  });

  const baseReport = {
    title: "Reporte de prueba — correo o celular",
    description: "Creado por guestReport.test.ts",
    departmentName: "Valle del Cauca",
    municipalityName: "Cali",
    locationSource: "manual",
    lat: 3.4516,
    lng: -76.532,
  };

  it("rejects a guest with neither email nor phone", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ categoryKey, ...baseReport, displayName: "Sin Contacto" });
    expect(res.status).toBe(400);
  });

  it("still creates without a display name — falls back to the email prefix (backend never required it, only the frontend UI does as a nicety)", async () => {
    const email = `guest-report-noname-${randomUUID()}@aquiayudamosve.test`;
    createdEmails.push(email);
    const res = await request(app).post("/api/reports").send({ categoryKey, ...baseReport, email });
    expect(res.status).toBe(201);

    const guestUser = await prisma.user.findUnique({ where: { email } });
    expect(guestUser?.displayName).toBe(email.split("@")[0]);

    await prisma.report.deleteMany({ where: { id: res.body.id } });
  });

  it("creates a report as a guest with just a name and email", async () => {
    const email = `guest-report-email-${randomUUID()}@aquiayudamosve.test`;
    createdEmails.push(email);
    const res = await request(app)
      .post("/api/reports")
      .send({ categoryKey, ...baseReport, displayName: "Vecino Email", email });
    expect(res.status).toBe(201);

    const guestUser = await prisma.user.findUnique({ where: { email } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.displayName).toBe("Vecino Email");

    await prisma.report.deleteMany({ where: { id: res.body.id } });
  });

  it("creates a report as a guest with just a name and phone — no email required", async () => {
    const phone = `3${Date.now().toString().slice(-9)}`;
    const syntheticEmail = `tel-${phone}@guest.aquiayudamosve.local`;
    createdEmails.push(syntheticEmail);
    const res = await request(app)
      .post("/api/reports")
      .send({ categoryKey, ...baseReport, displayName: "Vecino Celular", phone });
    expect(res.status).toBe(201);

    const guestUser = await prisma.user.findUnique({ where: { email: syntheticEmail } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.displayName).toBe("Vecino Celular");
    expect(guestUser?.phone).toBe(phone);

    await prisma.report.deleteMany({ where: { id: res.body.id } });
  });

  const authEmail = `guest-report-auth-${randomUUID()}@aquiayudamosve.test`;

  it("still works normally for an authenticated user (no guest fields needed)", async () => {
    const authRes = await request(app)
      .post("/api/auth/register")
      .send({ email: authEmail, password: "SuperSecreta123", displayName: "Auth Reporter" });
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${authRes.body.accessToken}`)
      .send({ categoryKey, ...baseReport });
    expect(res.status).toBe(201);

    await prisma.report.deleteMany({ where: { id: res.body.id } });
  });

  afterAll(async () => {
    const emails = [...createdEmails, authEmail];
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });
});
