import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recomputeReportTrustScore } from "../src/modules/trust/trustScore.service";

const prisma = new PrismaClient();

const CATEGORIES: { group: "ayuda" | "necesidad" | "critico" | "info"; key: string; label: string; sortOrder: number }[] = [
  // Ayuda disponible
  { group: "ayuda", key: "agua_potable", label: "Agua potable", sortOrder: 1 },
  { group: "ayuda", key: "alimentos", label: "Alimentos", sortOrder: 2 },
  { group: "ayuda", key: "refugio", label: "Refugio", sortOrder: 3 },
  { group: "ayuda", key: "medicamentos", label: "Medicamentos", sortOrder: 4 },
  { group: "ayuda", key: "atencion_medica", label: "Atención médica", sortOrder: 5 },
  { group: "ayuda", key: "centro_acopio", label: "Centro de acopio", sortOrder: 6 },
  { group: "ayuda", key: "transporte", label: "Transporte", sortOrder: 7 },
  { group: "ayuda", key: "energia", label: "Energía", sortOrder: 8 },
  { group: "ayuda", key: "conectividad", label: "Conectividad", sortOrder: 9 },
  { group: "ayuda", key: "voluntarios", label: "Voluntarios", sortOrder: 10 },
  // Necesidad de ayuda
  { group: "necesidad", key: "personas_heridas", label: "Personas heridas", sortOrder: 1 },
  { group: "necesidad", key: "falta_alimentos", label: "Falta de alimentos", sortOrder: 2 },
  { group: "necesidad", key: "falta_agua", label: "Falta de agua", sortOrder: 3 },
  { group: "necesidad", key: "necesidad_medicamentos", label: "Medicamentos", sortOrder: 4 },
  { group: "necesidad", key: "necesidad_refugio", label: "Refugio", sortOrder: 5 },
  { group: "necesidad", key: "personas_vulnerables", label: "Personas vulnerables", sortOrder: 6 },
  { group: "necesidad", key: "rescate_requerido", label: "Rescate requerido", sortOrder: 7 },
  // Punto crítico
  { group: "critico", key: "edificio_afectado", label: "Edificio afectado", sortOrder: 1 },
  { group: "critico", key: "derrumbe", label: "Derrumbe", sortOrder: 2 },
  { group: "critico", key: "carretera_bloqueada", label: "Carretera bloqueada", sortOrder: 3 },
  { group: "critico", key: "riesgo_estructural", label: "Riesgo estructural", sortOrder: 4 },
  { group: "critico", key: "inundacion", label: "Inundación", sortOrder: 5 },
  { group: "critico", key: "incendio", label: "Incendio", sortOrder: 6 },
  { group: "critico", key: "fuga_gas", label: "Fuga de gas", sortOrder: 7 },
  { group: "critico", key: "cableado_electrico", label: "Cableado eléctrico", sortOrder: 8 },
  { group: "critico", key: "zona_peligrosa", label: "Zona peligrosa", sortOrder: 9 },
  // Información
  { group: "info", key: "hospital_operativo", label: "Hospital operativo", sortOrder: 1 },
  { group: "info", key: "hospital_saturado", label: "Hospital saturado", sortOrder: 2 },
  { group: "info", key: "albergue", label: "Albergue", sortOrder: 3 },
  { group: "info", key: "centro_atencion", label: "Centro de atención", sortOrder: 4 },
  { group: "info", key: "punto_institucional", label: "Punto institucional", sortOrder: 5 },
  { group: "info", key: "via_habilitada", label: "Vía habilitada", sortOrder: 6 },
];

const CITY_CENTER: Record<string, [number, number]> = {
  Cali: [3.4516, -76.532],
  Pereira: [4.8087, -75.6906],
  Manizales: [5.0703, -75.5138],
  Armenia: [4.5339, -75.6811],
  Quibdó: [5.6947, -76.6611],
};

function jitter([lat, lng]: [number, number], seed: number): [number, number] {
  const d = ((seed * 37) % 100) / 10000; // small offset, deterministic per seed
  return [lat + d, lng - d];
}

async function upsertUser(email: string, password: string, displayName: string, role: "citizen" | "moderator" | "admin", repLevel: "nuevo" | "colaborador" | "colaborador_confiable" | "voluntario_verificado" | "organizacion" | "entidad_institucional", repScore: number) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName, role },
  });
  await prisma.userReputation.upsert({
    where: { userId: user.id },
    update: { level: repLevel, score: repScore },
    create: { userId: user.id, level: repLevel, score: repScore },
  });
  return user;
}

async function main() {
  console.log("Seeding categories...");
  for (const c of CATEGORIES) {
    await prisma.reportCategory.upsert({
      where: { key: c.key },
      update: { label: c.label, group: c.group, sortOrder: c.sortOrder, active: true },
      create: c,
    });
  }

  console.log("Seeding organization...");
  const cruzRoja = await prisma.organization.upsert({
    where: { id: "seed-org-cruz-roja" },
    update: { verified: true },
    create: { id: "seed-org-cruz-roja", name: "Cruz Roja Colombiana (demo)", type: "organismo_humanitario", verified: true },
  });

  console.log("Seeding users...");
  const admin = await upsertUser("admin@aquiayudamosve.org", "Admin1234!", "Admin AquiAyudamosVE", "admin", "entidad_institucional", 500);
  await upsertUser("moderador@aquiayudamosve.org", "Moderador1234!", "Moderador Demo", "moderator", "colaborador_confiable", 120);
  const orgUser = await upsertUser("cruzroja@aquiayudamosve.org", "CruzRoja1234!", "Cruz Roja (cuenta demo)", "citizen", "organizacion", 300);
  await prisma.user.update({ where: { id: orgUser.id }, data: { organizationId: cruzRoja.id } });
  const trusted = await upsertUser("colaborador@aquiayudamosve.org", "Colaborador1234!", "Colaborador Confiable Demo", "citizen", "colaborador_confiable", 80);
  const newUser1 = await upsertUser("vecino1@aquiayudamosve.org", "Vecino1234!", "Vecino de Cali", "citizen", "nuevo", 0);
  const newUser2 = await upsertUser("vecino2@aquiayudamosve.org", "Vecino1234!", "Vecina de Pereira", "citizen", "colaborador", 15);

  console.log("Seeding reports...");
  const cat = async (key: string) => prisma.reportCategory.findUniqueOrThrow({ where: { key } });

  type Seed = {
    categoryKey: string;
    title: string;
    description: string;
    city: keyof typeof CITY_CENTER;
    place: string;
    creator: string;
    org?: boolean;
    confirmedBy?: string[];
    hoursAgo: number;
    seedIndex: number;
  };

  const reportSeeds: Seed[] = [
    { categoryKey: "agua_potable", title: "Agua potable disponible", description: "Punto de hidratación abierto en la universidad, con filtros comunitarios.", city: "Cali", place: "Universidad del Valle", creator: newUser1.id, confirmedBy: [trusted.id, newUser2.id, orgUser.id], hoursAgo: 0.7, seedIndex: 1 },
    { categoryKey: "carretera_bloqueada", title: "Vía a Buenaventura bloqueada por derrumbe", description: "Deslizamiento cubre ambos carriles cerca del km 18.", city: "Cali", place: "Vía Cali–Buenaventura", creator: trusted.id, confirmedBy: [newUser1.id], hoursAgo: 2, seedIndex: 2 },
    { categoryKey: "falta_agua", title: "Falta de agua potable", description: "El barrio lleva más de un día sin suministro de agua.", city: "Pereira", place: "Barrio Cuba", creator: newUser2.id, hoursAgo: 0.2, seedIndex: 3 },
    { categoryKey: "hospital_operativo", title: "Hospital San Jorge operativo", description: "Atención de urgencias funcionando con normalidad.", city: "Pereira", place: "Hospital Universitario San Jorge", creator: orgUser.id, org: true, confirmedBy: [trusted.id, newUser1.id, newUser2.id], hoursAgo: 0.1, seedIndex: 4 },
    { categoryKey: "derrumbe", title: "Derrumbe sobre la vía Manizales–Bogotá", description: "Bloqueo total, se recomienda ruta alterna.", city: "Manizales", place: "Vía Manizales–Bogotá", creator: trusted.id, confirmedBy: [newUser1.id, newUser2.id, orgUser.id], hoursAgo: 3.5, seedIndex: 5 },
    { categoryKey: "refugio", title: "Refugio temporal habilitado", description: "Capacidad para 80 personas, se aceptan familias con mascotas.", city: "Manizales", place: "Coliseo Municipal", creator: newUser1.id, confirmedBy: [newUser2.id], hoursAgo: 2.5, seedIndex: 6 },
    { categoryKey: "personas_heridas", title: "Personas heridas requieren atención", description: "Varias personas con heridas leves esperando atención médica.", city: "Armenia", place: "Barrio Salvador Allende", creator: newUser2.id, hoursAgo: 0.08, seedIndex: 7 },
    { categoryKey: "centro_acopio", title: "Centro de acopio activo", description: "Recibiendo agua, alimentos no perecederos y ropa de abrigo.", city: "Armenia", place: "Parque de la Vida", creator: trusted.id, confirmedBy: [newUser1.id, newUser2.id], hoursAgo: 3, seedIndex: 8 },
    { categoryKey: "inundacion", title: "Inundación sin atender", description: "Varias viviendas anegadas tras la crecida del río.", city: "Quibdó", place: "Barrio Tomás Pérez", creator: newUser1.id, hoursAgo: 7, seedIndex: 9 },
    { categoryKey: "albergue", title: "Albergue institucional abierto", description: "Punto de albergue coordinado con Defensa Civil.", city: "Quibdó", place: "Coliseo General Junín", creator: orgUser.id, org: true, confirmedBy: [trusted.id, newUser2.id], hoursAgo: 0.5, seedIndex: 10 },
  ];

  for (const s of reportSeeds) {
    const category = await cat(s.categoryKey);
    const [lat, lng] = jitter(CITY_CENTER[s.city], s.seedIndex);
    const createdAt = new Date(Date.now() - s.hoursAgo * 3_600_000 - 3_600_000);
    const lastConfirmedAt = new Date(Date.now() - s.hoursAgo * 3_600_000);

    const report = await prisma.report.create({
      data: {
        categoryId: category.id,
        title: s.title,
        description: s.description,
        city: s.city,
        approxLocationText: s.place,
        lat,
        lng,
        createdById: s.creator,
        organizationId: s.org ? cruzRoja.id : null,
        isSensitive: category.key === "personas_heridas" || category.key === "personas_vulnerables" || category.key === "rescate_requerido",
        createdAt,
        updatedAt: createdAt,
        lastConfirmedAt,
        trustScore: 20,
      },
    });

    for (const confirmerId of s.confirmedBy ?? []) {
      await prisma.reportConfirmation.create({
        data: { reportId: report.id, userId: confirmerId, type: "confirm", createdAt: lastConfirmedAt },
      });
    }

    if (s.org) {
      await prisma.reportEvidence.create({
        data: { reportId: report.id, userId: s.creator, relatedOrgName: "Cruz Roja Colombiana", createdAt },
      });
    }

    // Confirmations/evidence above only insert rows — the score itself is
    // only ever derived by TrustScoreService, same as at runtime.
    await recomputeReportTrustScore(report.id);
  }

  // One report deliberately marked with contradicting reports to demo the "cuestionada" trust level.
  const rumor = await prisma.report.create({
    data: {
      categoryId: (await cat("edificio_afectado")).id,
      title: "Rumor: puente colapsado (sin confirmar)",
      description: "Publicación sin evidencia sobre un supuesto colapso del puente sobre el río Cali.",
      city: "Cali",
      approxLocationText: "Río Cali",
      lat: CITY_CENTER.Cali[0] + 0.01,
      lng: CITY_CENTER.Cali[1] - 0.01,
      createdById: newUser1.id,
      createdAt: new Date(Date.now() - 3_600_000),
      lastConfirmedAt: new Date(Date.now() - 3_600_000),
      trustScore: 15,
    },
  });
  for (const flagger of [trusted.id, newUser2.id, orgUser.id]) {
    await prisma.reportConfirmation.create({
      data: { reportId: rumor.id, userId: flagger, type: "incorrect" },
    });
  }
  await recomputeReportTrustScore(rumor.id);

  console.log(`Seed complete. Admin login: admin@aquiayudamosve.org / Admin1234! (user id ${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
