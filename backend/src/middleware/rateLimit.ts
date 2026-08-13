import rateLimit from "express-rate-limit";

// Generic API traffic — generous, since read endpoints must stay usable during
// an emergency spike (refugios, universidades y redes públicas comparten IP).
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints: tighter, keyed by IP+email to slow brute force without
// punishing everyone behind a shared IP for one attacker's guesses.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email ?? "").toString().toLowerCase()}`,
  message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
});

// Report creation: prevents flooding the map with junk during a fast-moving event.
export const createReportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anon",
  message: { error: "Has creado varios reportes recientemente. Espera antes de publicar otro." },
});

// Confirmations: caps how fast one account can vote, a cheap defense against
// coordinated verification manipulation (section 22 of the spec).
export const confirmationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anon",
  message: { error: "Estás confirmando reportes muy rápido. Espera un momento." },
});

// Confirmar sin cuenta puede acuñar una identidad guest nueva por intento —
// más caro que confirmationLimiter, que ya cubre a usuarios con sesión, así
// que este se salta a sí mismo cuando hay req.user (ese caso ya está
// cubierto arriba) y aplica un tope más estricto por IP para el resto.
export const guestActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "anon",
  skip: (req) => Boolean(req.user),
  message: { error: "Demasiadas acciones sin cuenta desde esta red. Espera antes de continuar o inicia sesión." },
});

// Reportes de mascotas: instancia propia, no comparte presupuesto con
// createReportLimiter — alguien reportando varios puntos de ayuda no debería
// quedarse sin poder reportar también una mascota perdida.
export const createPetReportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anon",
  message: { error: "Has reportado varias mascotas recientemente. Espera antes de reportar otra." },
});
