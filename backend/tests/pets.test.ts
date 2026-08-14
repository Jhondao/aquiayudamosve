import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { syntheticEmailForPhone } from "../src/lib/guestIdentity";
import { determinePetShareStatus } from "../src/modules/pets/petShareCard.service";

const app = createApp();

describe("determinePetShareStatus — pure classification", () => {
  it("reunited overrides reportType regardless of what it originally was", () => {
    expect(determinePetShareStatus({ reportType: "lost", status: "reunited" })).toBe("reunited");
    expect(determinePetShareStatus({ reportType: "found", status: "reunited" })).toBe("reunited");
    expect(determinePetShareStatus({ reportType: "needs_help", status: "reunited" })).toBe("reunited");
  });

  it("maps lost and found reportType directly when not reunited", () => {
    expect(determinePetShareStatus({ reportType: "lost", status: "lost" })).toBe("lost");
    expect(determinePetShareStatus({ reportType: "found", status: "sighted" })).toBe("found");
    expect(determinePetShareStatus({ reportType: "found", status: "sheltered" })).toBe("found");
  });

  it("falls back to needs_help for injured/needs_help report types", () => {
    expect(determinePetShareStatus({ reportType: "injured", status: "needs_help" })).toBe("needs_help");
    expect(determinePetShareStatus({ reportType: "needs_help", status: "needs_help" })).toBe("needs_help");
  });
});

describe("Crear un reporte de mascota (multipart, sin cuenta)", () => {
  const guestEmail = `pet-guest-${randomUUID()}@aquiayudamosve.test`;
  const phoneDigits = `3${Date.now().toString().slice(-9)}`;
  const syntheticPhoneEmail = `tel-${phoneDigits}@guest.aquiayudamosve.local`;
  const petIds: string[] = [];
  const guestEmails = [guestEmail, syntheticPhoneEmail];

  it("creates a lost pet given a name and email — no account, no auth header", async () => {
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Perro perdido cerca del parque, prueba automatizada de pets.test.ts")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4516")
      .field("lng", "-76.532")
      .field("isSheltered", "false")
      .field("displayName", "Guest Pet Reporter")
      .field("email", guestEmail);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("lost");
    expect(res.body.hidden).toBeUndefined();
    petIds.push(res.body.id);

    const guestUser = await prisma.user.findUnique({ where: { email: guestEmail } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.passwordHash).toBeNull();
  });

  it("creates a found+sheltered pet given a name and phone only, and coarsens coordinates", async () => {
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "found")
      .field("species", "cat")
      .field("description", "Gato encontrado, refugiado en casa — prueba automatizada de coarsening")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "gps")
      .field("lat", "3.451678")
      .field("lng", "-76.532912")
      .field("isSheltered", "true")
      .field("displayName", "Guest Phone Only")
      .field("phone", phoneDigits);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("sheltered");
    expect(res.body.isSheltered).toBe(true);
    // Redondeado a 3 decimales (~111m) — nunca la dirección exacta.
    expect(res.body.lat).toBe(3.452);
    expect(res.body.lng).toBe(-76.533);
    expect(res.body.approxLocationText).toBe("Ubicación aproximada (precisión reducida)");
    petIds.push(res.body.id);

    // No hay índice único por phone — resolveGuestContact sintetiza un email
    // placeholder a partir del celular (ver lib/guestIdentity.ts).
    const guestUser = await prisma.user.findUnique({ where: { email: syntheticPhoneEmail } });
    expect(guestUser?.isGuest).toBe(true);
    expect(guestUser?.phone).toBe(phoneDigits);
  });

  it("ignores isSheltered=true for a reportType that isn't 'found' (never coarsens a lost pet's own location)", async () => {
    const ignoreShelteredEmail = `pet-guest-ignore-${randomUUID()}@aquiayudamosve.test`;
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "isSheltered mal enviado por el cliente para un reporte de perdida")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.451678")
      .field("lng", "-76.532912")
      .field("isSheltered", "true")
      .field("displayName", "Guest Ignora Sheltered")
      .field("email", ignoreShelteredEmail);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("lost");
    expect(res.body.isSheltered).toBe(false);
    expect(res.body.lat).toBe(3.451678);
    expect(res.body.approxLocationText).toBeNull();
    petIds.push(res.body.id);
    guestEmails.push(ignoreShelteredEmail);
  });

  it("rejects a guest with neither email nor phone", async () => {
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Sin contacto de invitado — debe fallar")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4516")
      .field("lng", "-76.532")
      .field("displayName", "Sin Contacto");

    expect(res.status).toBe(400);
  });

  it("rejects a request where the honeypot field was filled in", async () => {
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Prueba honeypot anti-spam para mascotas")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4516")
      .field("lng", "-76.532")
      .field("displayName", "Bot")
      .field("email", `bot-${randomUUID()}@aquiayudamosve.test`)
      .field("website", "http://spam.example");

    expect(res.status).toBe(400);
  });

  it("requires helpCategory when reportType is needs_help", async () => {
    // La identidad guest se resuelve antes del guard de helpCategory (ver
    // pets.service.ts#createPetReport), así que este 400 sí deja un User
    // creado aunque el PetReport nunca se llegue a crear — hay que limpiarlo
    // igual que los correos que sí terminan en 201.
    const email = `pet-needshelp-fails-${randomUUID()}@aquiayudamosve.test`;
    guestEmails.push(email);
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "needs_help")
      .field("species", "dog")
      .field("description", "Perro herido necesita ayuda veterinaria urgente")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4516")
      .field("lng", "-76.532")
      .field("displayName", "Reporta Herido")
      .field("email", email);

    expect(res.status).toBe(400);
  });

  it("accepts needs_help once helpCategory is provided", async () => {
    const email = `pet-needshelp-ok-${randomUUID()}@aquiayudamosve.test`;
    const res = await request(app)
      .post("/api/pets")
      .field("reportType", "needs_help")
      .field("species", "dog")
      .field("description", "Perro herido necesita ayuda veterinaria urgente")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4516")
      .field("lng", "-76.532")
      .field("helpCategory", "veterinary")
      .field("isEmergency", "true")
      .field("displayName", "Reporta Herido")
      .field("email", email);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("needs_help");
    expect(res.body.helpCategory).toBe("veterinary");
    expect(res.body.isEmergency).toBe(true);
    petIds.push(res.body.id);
    guestEmails.push(email);
  });

  afterAll(async () => {
    await prisma.petShareEvent.deleteMany({ where: { petReportId: { in: petIds } } });
    await prisma.petReport.deleteMany({ where: { id: { in: petIds } } });
    await prisma.session.deleteMany({ where: { user: { email: { in: guestEmails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: guestEmails } } } });
    await prisma.user.deleteMany({ where: { email: { in: guestEmails } } });
    // El correo de honeypot y el de "sin contacto" nunca llegan a crear
    // usuario — la request se rechaza antes de tocar la DB.
  });
});

describe("Crear un reporte de mascota con sesión — atribución correcta", () => {
  const email = `pet-auth-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let token: string;
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Pet Auth Tester" });
    token = res.body.accessToken;
    userId = res.body.profile.id;
  });

  it("attributes the pet to the authenticated user, not a newly minted guest", async () => {
    const res = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${token}`)
      .field("reportType", "lost")
      .field("species", "cat")
      .field("description", "Gato de prueba creado con sesión activa — verificación de atribución")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.4")
      .field("lng", "-76.5");

    expect(res.status).toBe(201);
    expect(res.body.createdById).toBe(userId);
    petId = res.body.id;

    // No debió crearse ningún guest nuevo — el único User con este email es
    // la cuenta real que se registró en el beforeAll.
    const usersWithEmail = await prisma.user.count({ where: { email } });
    expect(usersWithEmail).toBe(1);
  });

  afterAll(async () => {
    await prisma.petReport.deleteMany({ where: { id: petId } });
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.userReputation.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });
});

describe("Cambiar el estado de una mascota — comunitario + rastro en AuditLog", () => {
  const creatorEmail = `pet-status-creator-${randomUUID()}@aquiayudamosve.test`;
  const otherEmail = `pet-status-other-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let creatorToken: string;
  let otherToken: string;
  let otherUserId: string;
  let petId: string;

  beforeAll(async () => {
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: creatorEmail, password, displayName: "Pet Status Creator" });
    creatorToken = creatorRes.body.accessToken;

    const otherRes = await request(app)
      .post("/api/auth/register")
      .send({ email: otherEmail, password, displayName: "Pet Status Other" });
    otherToken = otherRes.body.accessToken;
    otherUserId = otherRes.body.profile.id;

    const petRes = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${creatorToken}`)
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Perro perdido — prueba de cambio de estado comunitario")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.45")
      .field("lng", "-76.53");
    petId = petRes.body.id;
  });

  it("requires a session", async () => {
    const res = await request(app).patch(`/api/pets/${petId}/status`).send({ status: "found" });
    expect(res.status).toBe(401);
  });

  it("allows a DIFFERENT authenticated user to change the status — community-open, not creator-only", async () => {
    const res = await request(app)
      .patch(`/api/pets/${petId}/status`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ status: "reunited", note: "Se reunió con su familia esta tarde" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reunited");
  });

  it("leaves a visible AuditLog trail with the actor and the from/to transition", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "pet_report", entityId: petId, action: "pet.status_update" },
      orderBy: { createdAt: "desc" },
    });

    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(otherUserId);
    const metadata = log?.metadata as { from?: string; to?: string; note?: string } | null;
    expect(metadata?.from).toBe("lost");
    expect(metadata?.to).toBe("reunited");
    expect(metadata?.note).toBe("Se reunió con su familia esta tarde");
  });

  afterAll(async () => {
    await prisma.petShareEvent.deleteMany({ where: { petReportId: petId } });
    await prisma.petReport.deleteMany({ where: { id: petId } });
    const emails = [creatorEmail, otherEmail];
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });
});

describe("Moderación de mascotas (RBAC)", () => {
  const citizenEmail = `pet-mod-citizen-${randomUUID()}@aquiayudamosve.test`;
  const modEmail = `pet-mod-mod-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let citizenToken: string;
  let modToken: string;
  let petId: string;

  beforeAll(async () => {
    const citizenRes = await request(app)
      .post("/api/auth/register")
      .send({ email: citizenEmail, password, displayName: "Pet Mod Citizen" });
    citizenToken = citizenRes.body.accessToken;

    const passwordHash = await bcrypt.hash(password, 12);
    const mod = await prisma.user.create({
      data: { email: modEmail, passwordHash, displayName: "Pet Moderator", role: "moderator" },
    });
    await prisma.userReputation.create({ data: { userId: mod.id, level: "colaborador_confiable", score: 100 } });
    const modLogin = await request(app).post("/api/auth/login").send({ email: modEmail, password });
    modToken = modLogin.body.accessToken;

    const petRes = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${citizenToken}`)
      .field("reportType", "found")
      .field("species", "cat")
      .field("description", "Gato encontrado — prueba de moderación (hide/unhide/delete)")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.45")
      .field("lng", "-76.53");
    petId = petRes.body.id;
  });

  it("blocks a citizen from the pets moderation endpoint", async () => {
    const res = await request(app).get("/api/admin/pets").set("Authorization", `Bearer ${citizenToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks an unauthenticated request entirely", async () => {
    const res = await request(app).get("/api/admin/pets");
    expect(res.status).toBe(401);
  });

  it("lets a moderator list all pets, including the hidden flag", async () => {
    const res = await request(app).get("/api/admin/pets").set("Authorization", `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    const mine = res.body.pets.find((p: { id: string }) => p.id === petId);
    expect(mine).toBeDefined();
    expect(mine.hidden).toBe(false);
  });

  it("rejects an action outside hide/unhide/delete", async () => {
    const res = await request(app)
      .patch(`/api/admin/pets/${petId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "resolve", reason: "No aplica a mascotas" });
    expect(res.status).toBe(400);
  });

  it("hides the pet — it disappears from the public endpoint", async () => {
    const patchRes = await request(app)
      .patch(`/api/admin/pets/${petId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "hide", reason: "Prueba de moderación: ocultar" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.hidden).toBe(true);

    const publicRes = await request(app).get(`/api/pets/${petId}`);
    expect(publicRes.status).toBe(404);
  });

  it("unhides the pet — it's public again", async () => {
    const patchRes = await request(app)
      .patch(`/api/admin/pets/${petId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "unhide", reason: "Prueba de moderación: revertir" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.hidden).toBe(false);

    const publicRes = await request(app).get(`/api/pets/${petId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.hidden).toBeUndefined();
  });

  it("deletes the pet — 404 publicly and excluded from public listings", async () => {
    const patchRes = await request(app)
      .patch(`/api/admin/pets/${petId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "delete", reason: "Prueba de moderación: eliminar" });
    expect(patchRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/pets/${petId}`);
    expect(publicRes.status).toBe(404);

    const listRes = await request(app).get("/api/pets?pageSize=100");
    expect(listRes.body.pets.some((p: { id: string }) => p.id === petId)).toBe(false);
  });

  afterAll(async () => {
    await prisma.petShareEvent.deleteMany({ where: { petReportId: petId } });
    await prisma.petReport.deleteMany({ where: { id: petId } });
    const emails = [citizenEmail, modEmail];
    await prisma.session.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });
});

describe("Confirmar una mascota (Fase 2)", () => {
  const creatorEmail = `pet-confirm-creator-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let creatorToken: string;
  let petId: string;

  beforeAll(async () => {
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: creatorEmail, password, displayName: "Pet Confirm Creator" });
    creatorToken = creatorRes.body.accessToken;

    const petRes = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${creatorToken}`)
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Perro perdido — prueba de confirmaciones Fase 2")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.45")
      .field("lng", "-76.53");
    petId = petRes.body.id;
  });

  it("rejects a guest confirmation with neither email nor phone", async () => {
    const res = await request(app).post(`/api/pets/${petId}/confirm`).send({ type: "confirm", displayName: "Sin Contacto" });
    expect(res.status).toBe(400);
  });

  it("confirms as a guest — bumps confirmationsCount and lastConfirmedAt", async () => {
    const email = `pet-confirm-guest-${randomUUID()}@aquiayudamosve.test`;
    const res = await request(app)
      .post(`/api/pets/${petId}/confirm`)
      .send({ type: "confirm", displayName: "Vecino Guest", email });
    expect(res.status).toBe(200);
    expect(res.body.confirmationsCount).toBe(1);

    const guestUser = await prisma.user.findUnique({ where: { email } });
    expect(guestUser?.isGuest).toBe(true);
  });

  it("rejects a repeated confirmation of the same type for the same identity (409)", async () => {
    const email = `pet-confirm-dup-${randomUUID()}@aquiayudamosve.test`;
    await request(app).post(`/api/pets/${petId}/confirm`).send({ type: "confirm", displayName: "Repetido", email });
    const res = await request(app).post(`/api/pets/${petId}/confirm`).send({ type: "confirm", displayName: "Repetido", email });
    expect(res.status).toBe(409);
  });

  it("lets an authenticated user mark it incorrect, independent of the guest confirmation", async () => {
    const otherRes = await request(app)
      .post("/api/auth/register")
      .send({ email: `pet-confirm-other-${randomUUID()}@aquiayudamosve.test`, password, displayName: "Pet Confirm Other" });
    const res = await request(app)
      .post(`/api/pets/${petId}/confirm`)
      .set("Authorization", `Bearer ${otherRes.body.accessToken}`)
      .send({ type: "incorrect" });
    expect(res.status).toBe(200);
    expect(res.body.incorrectCount).toBe(1);
  });

  afterAll(async () => {
    await prisma.petReport.deleteMany({ where: { id: petId } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "pet-confirm-" } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { contains: "pet-confirm-" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "pet-confirm-" } } });
  });
});

describe("Avistamientos de una mascota — 'LA VI AQUÍ' (Fase 2)", () => {
  const creatorEmail = `pet-sighting-creator-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let petId: string;

  beforeAll(async () => {
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: creatorEmail, password, displayName: "Pet Sighting Creator" });

    const petRes = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${creatorRes.body.accessToken}`)
      .field("reportType", "lost")
      .field("species", "cat")
      .field("description", "Gato perdido — prueba de avistamientos Fase 2")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.45")
      .field("lng", "-76.53");
    petId = petRes.body.id;
  });

  it("records a sighting with location as a guest, never exposing the author", async () => {
    const res = await request(app)
      .post(`/api/pets/${petId}/sightings`)
      .send({ lat: 3.46, lng: -76.52, note: "La vi cruzando la calle", displayName: "Testigo", email: `pet-sighting-guest-${randomUUID()}@aquiayudamosve.test` });
    expect(res.status).toBe(201);
    expect(res.body.lat).toBe(3.46);
    expect(res.body.note).toBe("La vi cruzando la calle");
    expect(res.body.userId).toBeUndefined();
    expect(res.body.displayName).toBeUndefined();
  });

  it("records a sighting without a location — just a note", async () => {
    const res = await request(app)
      .post(`/api/pets/${petId}/sightings`)
      .send({ note: "La escuché maullar cerca del parque", displayName: "Otro Testigo", email: `pet-sighting-guest2-${randomUUID()}@aquiayudamosve.test` });
    expect(res.status).toBe(201);
    expect(res.body.lat).toBeNull();
    expect(res.body.note).toBe("La escuché maullar cerca del parque");
  });

  it("lists sightings newest-first, anonymized", async () => {
    const res = await request(app).get(`/api/pets/${petId}/sightings`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((s: { userId?: string }) => s.userId === undefined)).toBe(true);
  });

  afterAll(async () => {
    await prisma.petReport.deleteMany({ where: { id: petId } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "pet-sighting-" } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { contains: "pet-sighting-" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "pet-sighting-" } } });
  });
});

describe("Posibles coincidencias (Fase 2)", () => {
  const creatorEmail = `pet-match-creator-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let creatorToken: string;
  let modToken: string;
  let lostDogId: string;
  let foundDogId: string;
  let foundCatId: string;

  beforeAll(async () => {
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: creatorEmail, password, displayName: "Pet Match Creator" });
    creatorToken = creatorRes.body.accessToken;

    const passwordHash = await bcrypt.hash(password, 12);
    const modEmail = `pet-match-mod-${randomUUID()}@aquiayudamosve.test`;
    const mod = await prisma.user.create({ data: { email: modEmail, passwordHash, displayName: "Pet Match Mod", role: "moderator" } });
    await prisma.userReputation.create({ data: { userId: mod.id, level: "colaborador_confiable", score: 100 } });
    const modLogin = await request(app).post("/api/auth/login").send({ email: modEmail, password });
    modToken = modLogin.body.accessToken;

    async function createPet(reportType: string, species: string, lat: string, lng: string, description: string) {
      const res = await request(app)
        .post("/api/pets")
        .set("Authorization", `Bearer ${creatorToken}`)
        .field("reportType", reportType)
        .field("species", species)
        .field("description", description)
        .field("departmentName", "Antioquia")
        .field("municipalityName", "Medellín")
        .field("locationSource", "manual")
        .field("lat", lat)
        .field("lng", lng);
      return res.body.id as string;
    }

    lostDogId = await createPet("lost", "dog", "6.250", "-75.560", "Perro perdido — prueba de posibles coincidencias");
    foundDogId = await createPet("found", "dog", "6.251", "-75.561", "Perro encontrado cerca — prueba de posibles coincidencias");
    foundCatId = await createPet("found", "cat", "6.251", "-75.561", "Gato encontrado cerca — especie distinta, no debe matchear");
  });

  it("finds a nearby found dog as a possible match for a lost dog, excluding a different species", async () => {
    const res = await request(app).get(`/api/pets/${lostDogId}/possible-matches`);
    expect(res.status).toBe(200);
    const ids = res.body.map((m: { id: string }) => m.id);
    expect(ids).toContain(foundDogId);
    expect(ids).not.toContain(foundCatId);
    const match = res.body.find((m: { id: string }) => m.id === foundDogId);
    expect(typeof match.distanceMeters).toBe("number");
  });

  it("excludes a hidden pet from possible matches", async () => {
    await request(app)
      .patch(`/api/admin/pets/${foundDogId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "hide", reason: "Prueba: excluir de posibles coincidencias" });

    const res = await request(app).get(`/api/pets/${lostDogId}/possible-matches`);
    expect(res.body.map((m: { id: string }) => m.id)).not.toContain(foundDogId);

    await request(app)
      .patch(`/api/admin/pets/${foundDogId}`)
      .set("Authorization", `Bearer ${modToken}`)
      .send({ action: "unhide", reason: "Prueba: revertir" });
  });

  afterAll(async () => {
    await prisma.petReport.deleteMany({ where: { id: { in: [lostDogId, foundDogId, foundCatId] } } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "pet-match-" } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { contains: "pet-match-" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "pet-match-" } } });
  });
});

describe("Revelar contacto de una mascota (Fase 2)", () => {
  const password = "SuperSecreta123";
  let phoneOnlyPetId: string;
  let emailPetId: string;
  const phoneOnlyCreatorPhone = `3${Date.now().toString().slice(-9)}`;
  const emailCreatorEmail = `pet-reveal-email-creator-${randomUUID()}@aquiayudamosve.test`;

  beforeAll(async () => {
    // Creados directo por Prisma, no vía POST /api/pets como invitado — ese
    // endpoint comparte un rate limiter (createPetReportLimiter, 8/10min por
    // IP) con TODO el resto del archivo, incluido el primer describe block
    // que ya lo agota con sus propias pruebas de invitado. Esto también deja
    // el escenario exacto que hace falta (email sintético real vía
    // syntheticEmailForPhone), sin depender de si ese endpoint tiene
    // presupuesto libre en este punto de la corrida.
    const phoneOnlyUser = await prisma.user.create({
      data: {
        email: syntheticEmailForPhone(phoneOnlyCreatorPhone),
        phone: phoneOnlyCreatorPhone,
        isGuest: true,
        displayName: "Solo Celular",
        reputation: { create: { score: 0, level: "nuevo" } },
      },
    });
    const phoneOnlyPet = await prisma.petReport.create({
      data: {
        reportType: "lost",
        species: "dog",
        description: "Perro perdido — creador solo dio celular, prueba de revelar contacto",
        status: "lost",
        departmentName: "Antioquia",
        municipalityName: "Medellín",
        locationSource: "manual",
        lat: 6.25,
        lng: -75.56,
        createdById: phoneOnlyUser.id,
      },
    });
    phoneOnlyPetId = phoneOnlyPet.id;

    const emailUser = await prisma.user.create({
      data: {
        email: emailCreatorEmail,
        isGuest: true,
        displayName: "Con Correo",
        reputation: { create: { score: 0, level: "nuevo" } },
      },
    });
    const emailPet = await prisma.petReport.create({
      data: {
        reportType: "lost",
        species: "cat",
        description: "Gato perdido — creador dio correo, prueba de revelar contacto",
        status: "lost",
        departmentName: "Antioquia",
        municipalityName: "Medellín",
        locationSource: "manual",
        lat: 6.25,
        lng: -75.56,
        createdById: emailUser.id,
      },
    });
    emailPetId = emailPet.id;
  });

  it("never leaks the synthetic placeholder email for a phone-only creator", async () => {
    const res = await request(app)
      .post(`/api/pets/${phoneOnlyPetId}/reveal-contact`)
      .send({ displayName: "Quiere Contactar", email: `pet-reveal-requester-${randomUUID()}@aquiayudamosve.test` });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Solo Celular");
    expect(res.body.phone).toBe(phoneOnlyCreatorPhone);
    expect(res.body.email).toBeUndefined();
  });

  it("reveals the real email for a creator who gave one", async () => {
    const res = await request(app)
      .post(`/api/pets/${emailPetId}/reveal-contact`)
      .send({ displayName: "Otro Interesado", email: `pet-reveal-requester2-${randomUUID()}@aquiayudamosve.test` });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(emailCreatorEmail);
  });

  it("requires the requester's own name and contact when there's no session", async () => {
    const res = await request(app).post(`/api/pets/${emailPetId}/reveal-contact`).send({});
    expect(res.status).toBe(400);
  });

  it("logs an AuditLog entry with the requester, never the revealed email/phone", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "pet_report", entityId: emailPetId, action: "pet.contact_revealed" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).not.toBeNull();
    const metadata = log?.metadata as Record<string, unknown> | null;
    expect(metadata).toHaveProperty("revealedToUserId");
    expect(JSON.stringify(metadata)).not.toContain(emailCreatorEmail);
  });

  afterAll(async () => {
    await prisma.petReport.deleteMany({ where: { id: { in: [phoneOnlyPetId, emailPetId] } } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "pet-reveal-" } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { contains: "pet-reveal-" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "pet-reveal-" } } });
  });
});

// Describe aparte al final: el rate limiter de revelar contacto (5/hora por
// IP, sin `skip` para sesión activa) es compartido por todo el proceso de
// pruebas — no importa cuántas llamadas exitosas hicieron los bloques de
// arriba, disparar bastantes más que el resto del presupuesto siempre debe
// terminar en un 429, mismo criterio que el describe de rate limit al final
// de guestConfirm.test.ts.
describe("Rate limit de revelar contacto (Fase 2)", () => {
  it("blocks further reveal-contact attempts from the same IP, even authenticated", async () => {
    const password = "SuperSecreta123";
    const authRes = await request(app)
      .post("/api/auth/register")
      .send({ email: `pet-reveal-ratelimit-${randomUUID()}@aquiayudamosve.test`, password, displayName: "Reveal Ratelimit" });
    const token = authRes.body.accessToken;

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      // Secuencial a propósito — mismo motivo que el resto de pruebas de
      // rate limit: ejercita el mismo bucket de IP.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post(`/api/pets/${randomUUID()}/reveal-contact`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { contains: "pet-reveal-ratelimit-" } } } });
    await prisma.userReputation.deleteMany({ where: { user: { email: { contains: "pet-reveal-ratelimit-" } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "pet-reveal-ratelimit-" } } });
  });
});

describe("Compartir un reporte de mascota", () => {
  const email = `pet-share-${randomUUID()}@aquiayudamosve.test`;
  const password = "SuperSecreta123";
  let token: string;
  let petId: string;

  beforeAll(async () => {
    const authRes = await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName: "Pet Share Tester" });
    token = authRes.body.accessToken;

    const petRes = await request(app)
      .post("/api/pets")
      .set("Authorization", `Bearer ${token}`)
      .field("reportType", "lost")
      .field("species", "dog")
      .field("description", "Perro perdido — prueba de compartir")
      .field("departmentName", "Valle del Cauca")
      .field("municipalityName", "Cali")
      .field("locationSource", "manual")
      .field("lat", "3.45")
      .field("lng", "-76.53");
    petId = petRes.body.id;
  });

  // GET /:id/share-card en un pet real no se prueba aquí a nivel HTTP: a
  // diferencia de reportes (donde solo estados de confianza alta generan
  // imagen, así que un reporte fresco nunca toca almacenamiento), TODOS los
  // estados de mascota son elegibles para imagen por diseño (ver
  // petShareCard.service.ts) — cualquier llamada real intenta subir un PNG,
  // lo que requiere credenciales de object storage que este entorno de
  // pruebas no tiene configuradas. Esa lógica de clasificación ya se cubre
  // como función pura arriba (determinePetShareStatus); el render en sí se
  // verificó a mano con un script suelto durante el refactor de
  // lib/cardRenderer.ts.

  it("GET /:id/share-card on a nonexistent pet is a 404 (fails before touching storage)", async () => {
    const res = await request(app).get(`/api/pets/${randomUUID()}/share-card`);
    expect(res.status).toBe(404);
  });

  it("POST /:id/share-event records telemetry without requiring auth", async () => {
    const res = await request(app).post(`/api/pets/${petId}/share-event`).send({ channel: "whatsapp" });
    expect(res.status).toBe(202);

    const events = await prisma.petShareEvent.findMany({ where: { petReportId: petId } });
    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("whatsapp");
    expect(events[0].userId).toBeNull();
  });

  it("POST /:id/share-event rejects an invalid channel", async () => {
    const res = await request(app).post(`/api/pets/${petId}/share-event`).send({ channel: "carrier_pigeon" });
    expect(res.status).toBe(400);
  });

  it("GET /r/mascota/:id degrades gracefully (200, generic fallback) for a nonexistent pet", async () => {
    const res = await request(app).get(`/r/mascota/${randomUUID()}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("no está disponible");
  });

  afterAll(async () => {
    await prisma.petShareEvent.deleteMany({ where: { petReportId: petId } });
    await prisma.petReport.deleteMany({ where: { id: petId } });
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.userReputation.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
