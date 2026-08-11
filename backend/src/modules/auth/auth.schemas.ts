import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido.").max(255),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(128),
  displayName: z.string().trim().min(2, "Nombre demasiado corto.").max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido."),
  password: z.string().min(1, "La contraseña es obligatoria."),
});
