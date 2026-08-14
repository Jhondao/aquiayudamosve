import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Directorio 'quiero ayudar con mascotas' (Fase 3)", () => {
  const helperEmail = `pet-resource-helper-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let helperToken: string;
  let resourceId: string;

  beforeAll(async () => {
    const helperRes = await request(app)
      .post("/api/auth/register")
      .send({ email: helperEmail, password, displayName: "Pet Resource Helper" });
    helperToken = helperRes.body.accessToken;
  });

  it("requires a session to register as a resource", async () => {
    const res = await request(app).post("/api/pets/resources").send({
      category: "veterinary",
      name: "Clínica Prueba",
      description: "Atención veterinaria de emergencia",
      contactName: "Dra. Prueba",
      contactEmail: `pet-resource-clinic-${randomUUID()}@aquiayudamosve.test`,
      departmentName: "Antioquia",
      municipalityName: "Medellín",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a resource with neither contact email nor phone", async () => {
    const res = await request(app)
      .post("/api/pets/resources")
      .set("Authorization", `Bearer ${helperToken}`)
      .send({
        category: "veterinary",
        name: "Clínica Sin Contacto",
        description: "Atención veterinaria de emergencia",
        contactName: "Dra. Prueba",
        departmentName: "Antioquia",
        municipalityName: "Medellín",
      });
    expect(res.status).toBe(400);
  });

  it("creates a resource with a session and leaves an AuditLog entry", async () => {
    const res = await request(app)
      .post("/api/pets/resources")
      .set("Authorization", `Bearer ${helperToken}`)
      .send({
        category: "veterinary",
        name: "Clínica Veterinaria Prueba",
        description: "Atención veterinaria de emergencia para mascotas heridas",
        contactName: "Dra. Prueba",
        contactPhone: "3001234567",
        departmentName: "Antioquia",
        municipalityName: "Medellín",
        availabilityNote: "24 horas",
      });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("veterinary");
    resourceId = res.body.id;

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "pet_resource", entityId: resourceId, action: "pet_resource.create" },
    });
    expect(log).not.toBeNull();
  });

  it("appears in the public, filterable listing", async () => {
    const res = await request(app)
      .get("/api/pets/resources")
      .query({ category: "veterinary", municipalityName: "Medellín" });
    expect(res.status).toBe(200);
    expect(res.body.resources.some((r: { id: string }) => r.id === resourceId)).toBe(true);
  });

  it("does not appear in a listing filtered by a different category", async () => {
    const res = await request(app).get("/api/pets/resources?category=transport");
    expect(res.body.resources.some((r: { id: string }) => r.id === resourceId)).toBe(false);
  });

  it("is fetchable by id", async () => {
    const res = await request(app).get(`/api/pets/resources/${resourceId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Clínica Veterinaria Prueba");
  });

  afterAll(async () => {
    await prisma.petResource.deleteMany({ where: { id: resourceId } });
    await prisma.session.deleteMany({ where: { user: { email: helperEmail } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: helperEmail } } });
    await prisma.user.deleteMany({ where: { email: helperEmail } });
  });
});

describe("Moderación del directorio de recursos (Fase 3)", () => {
  const citizenEmail = `pet-resource-citizen-${randomUUID()}@aquiayudamosve.test`;
  const modEmail = `pet-resource-mod-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let citizenToken: string;
  let modToken: string;
  let resourceId: string;

  beforeAll(async () => {
    const citizenRes = await request(app)
      .post("/api/auth/register")
      .send({ email: citizenEmail, password, displayName: "Pet Resource Citizen" });
    citizenToken = citizenRes.body.accessToken;

    const passwordHash = await bcrypt.hash(password, 12);
    const mod = await prisma.user.create({
      data: { email: modEmail, passwordHash, displayName: "Pet Resource Mod", role: "moderator" },
    });
    await prisma.userReputation.create({ data: { userId: mod.id, level: "colaborador_confiable", score: 100 } });
    const modLogin = await request(app).post("/api/auth/login").send({ email: modEmail, password });
    modToken = modLogin.body.accessToken;

    const resourceRes = await request(app)
      .post("/api/pets/resources")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        category: "transport",
        name: "Transporte de Mascotas Prueba",
        description: "Traslado de mascotas heridas a la clínica más cercana",
        contactName: "Voluntario Prueba",
        contactPhone: "3009876543",
        departmentName: "Valle del Cauca",
        municipalityName: "Cali",
      });
    resourceId = resourceRes.body.id;
  });

  it("blocks a citizen from the resource moderation endpoint", async () => {
    const res = await request(app).get("/api/admin/pet-resources").set("Authorization", `Bearer ${citizenToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a moderator list all resources, including the hidden flag", async () => {
    const res = await request(app).get("/api/admin/pet-resources").set("Authorization", `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    const mine = res.body.resources.find((r: { id: string }) => r.id === resourceId);
    expect(mine).toBeDefined();
    expect(mine.hidden).toBe(false);
  });

  it("hides the resource — disappears from the public endpoint", async () => {
    const patchRes = await request(app)
      .patch(`/api/admin/pet-resources/${resourceId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "hide", reason: "Prueba de moderación: ocultar" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.hidden).toBe(true);

    const publicRes = await request(app).get(`/api/pets/resources/${resourceId}`);
    expect(publicRes.status).toBe(404);
  });

  it("deletes the resource — 404 publicly", async () => {
    const patchRes = await request(app)
      .patch(`/api/admin/pet-resources/${resourceId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "delete", reason: "Prueba de moderación: eliminar" });
    expect(patchRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/pets/resources/${resourceId}`);
    expect(publicRes.status).toBe(404);
  });

  afterAll(async () => {
    await prisma.petResource.deleteMany({ where: { id: resourceId } });
    const emails = [citizenEmail, modEmail];
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });
});
