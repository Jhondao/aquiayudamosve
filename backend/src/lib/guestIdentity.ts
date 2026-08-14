import { prisma } from "./prisma";
import { HttpError } from "../middleware/errorHandler";

/**
 * Publicar/confirmar/reportar sin sesión es un patrón que se repite en varios
 * módulos (reportes, mascotas) — no hay signup wall para pedir o dar ayuda.
 * Necesitamos una identidad estable para el sistema de confianza/reputación,
 * así que un email (o, si solo hay celular, uno sintético — ver
 * syntheticEmailForPhone) reusa o crea un `User` sin contraseña. Si el email
 * ya pertenece a una cuenta real, se rechaza — si no, cualquiera podría
 * actuar bajo la identidad de otra persona solo escribiendo su correo.
 *
 * `phone`/`displayName` son opcionales: publicar un reporte exige ambos
 * (ese schema los pide juntos), confirmar solo exige nombre + correo-o-
 * celular. `displayName` solo aplica al crear el `User` por primera vez —
 * reusar una identidad guest existente nunca le pisa el nombre que ya tenía.
 */
export async function resolveGuestContact(email: string, phone?: string, displayName?: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isGuest) {
      throw new HttpError(409, "Ese correo ya tiene una cuenta. Inicia sesión para continuar.");
    }
    if (phone && existing.phone !== phone) {
      await prisma.user.update({ where: { id: existing.id }, data: { phone } });
    }
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email,
      phone: phone ?? null,
      isGuest: true,
      displayName: displayName?.trim() || email.split("@")[0],
      reputation: { create: { score: 0, level: "nuevo" } },
    },
  });
  return created.id;
}

// `User.email` es NOT NULL + @unique — un guest que solo da celular (sin
// correo) igual necesita una fila con un email real para esa columna. Se
// sintetiza uno determinístico a partir del celular, nunca mostrado en la
// UI, solo para satisfacer la restricción del modelo de datos. Dos personas
// distintas usando el mismo celular terminan bajo la misma identidad guest a
// propósito — mismo criterio que ya aplica hoy por correo repetido.
export function syntheticEmailForPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `tel-${digits}@guest.aquiayudamosve.local`;
}
