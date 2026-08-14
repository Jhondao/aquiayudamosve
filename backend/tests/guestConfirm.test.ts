import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Confirmar un reporte sin cuenta", () => {
  const realAccountEmail = `real-account-${randomUUID()}@aquiayudamosve.test`;
  const guestEmail = `guest-confirm-${randomUUID()}@aquiayudamosve.test`;
  const creatorEmail = `report-creator-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let reportId: string;

  beforeAll(async () => {
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: creatorEmail, password, displayName: "Creator" });
    const creatorToken = creatorRes.body.accessToken;

    const category = await prisma.reportCategory.findFirstOrThrow({ where: { group: "ayuda" } });
    const reportRes = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        categoryKey: category.key,
        title: "Reporte de prueba para confirmar sin cuenta",
        description: "Creado por guestConfirm.test.ts",
        departmentName: "Valle del Cauca",
        municipalityName: "Cali",
        locationSource: "manual",
        lat: 3.4516,
        lng: -76.532,
      });
    reportId = reportRes.body.id;

    // Cuenta real preexistente, para probar que un invitado no puede
    // "confirmar" apropiándose de un correo que ya tiene contraseña.
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email: realAccountEmail,
        passwordHash,
        displayName: "Real Account",
        reputation: { create: { score: 0, level: "nuevo" } },
      },
    });
  });

  it("confirms without an account given a name and email", async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/confirm`)
      .send({ type: "confirm", displayName: "Vecino Anónimo", email: guestEmail });

    expect(res.status).toBe(200);
    expect(res.body.confirmationsCount).toBe(1);

    const guestUser = await prisma.user.findUnique({ where: { email: guestEmail } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.displayName).toBe("Vecino Anónimo");
    expect(guestUser?.passwordHash).toBeNull();
  });

  it("rejects a guest confirmation without an email or a phone", async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/confirm`)
      .send({ type: "unsure", displayName: "Sin Contacto" });
    expect(res.status).toBe(400);
  });

  it("confirms with just a name and a phone — no email required", async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/confirm`)
      .send({ type: "unsure", displayName: "Solo Celular", phone: "3011234567" });

    expect(res.status).toBe(200);

    // No hay índice único por phone en el modelo — resolveGuestContact
    // sintetiza un email placeholder a partir del celular para poder crear
    // la fila (ver reports.service.ts#syntheticEmailForPhone).
    const guestUser = await prisma.user.findUnique({ where: { email: "tel-3011234567@guest.aquiayudamosve.local" } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.displayName).toBe("Solo Celular");
    expect(guestUser?.phone).toBe("3011234567");
  });

  it("rejects a request where the honeypot field was filled in", async () => {
    const res = await request(app).post(`/api/reports/${reportId}/confirm`).send({
      type: "unsure",
      displayName: "Bot",
      email: `bot-${randomUUID()}@aquiayudamosve.test`,
      website: "http://spam.example",
    });
    expect(res.status).toBe(400);
  });

  it("refuses to let a guest act under an email that already has a real account", async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/confirm`)
      .send({ type: "unsure", displayName: "Impostor", email: realAccountEmail });
    expect(res.status).toBe(409);
  });

  const otherUserEmail = `other-user-${randomUUID()}@aquiayudamosve.test`;

  it("still works normally for an authenticated user (no guest fields needed)", async () => {
    const otherRes = await request(app)
      .post("/api/auth/register")
      .send({ email: otherUserEmail, password, displayName: "Other User" });
    const res = await request(app)
      .post(`/api/reports/${reportId}/confirm`)
      .set("Authorization", `Bearer ${otherRes.body.accessToken}`)
      .send({ type: "unsure" });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    // Orden importa: ReportConfirmation referencia tanto a Report como a
    // User por FK — hay que borrarlas antes de borrar cualquiera de los dos,
    // o el borrado de usuarios falla con una violación de FK.
    await prisma.reportConfirmation.deleteMany({ where: { reportId } });
    await prisma.report.deleteMany({ where: { id: reportId } });
    const emails = [
      realAccountEmail,
      guestEmail,
      creatorEmail,
      otherUserEmail,
      "tel-3011234567@guest.aquiayudamosve.local",
    ];
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    // El correo del intento con honeypot es aleatorio y nunca llegó a crear
    // usuario (la request se rechaza antes de tocar la DB), así que no
    // necesita limpieza propia.
  });
});

// Describe aparte y al final del archivo: consume el presupuesto completo
// del limiter de invitados (8 por 10 min por IP), así que corre después de
// las pruebas funcionales de arriba para no interferir con ellas.
describe("Rate limit de confirmaciones sin cuenta", () => {
  it("blocks further unauthenticated confirm attempts from the same IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      // Secuencial a propósito — el mismo motivo que rateLimit.test.ts: esto
      // ejercita el mismo bucket de IP, así que las peticiones no deben
      // correr en paralelo entre sí.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post(`/api/reports/${randomUUID()}/confirm`).send({ type: "confirm" });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
