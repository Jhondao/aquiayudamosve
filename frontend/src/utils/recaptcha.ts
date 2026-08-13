// Site key pública a propósito (ver index.html) — la verificación real pasa
// por el backend (lib/recaptcha.ts), esto solo genera el token.
const SITE_KEY = "6LcZRoQtAAAAAKGog-5O9WHEHo-9RpZ5A3bYl6qr";

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

/**
 * Devuelve un token de reCAPTCHA Enterprise para la acción dada, o `null` si
 * el script no cargó (bloqueador de anuncios, sin red, etc.). `null` nunca
 * bloquea la acción por sí solo del lado del backend — ver
 * requireRecaptchaForGuests en backend/src/lib/recaptcha.ts — el honeypot y
 * el rate limit de invitados siguen aplicando igual.
 */
export function getRecaptchaToken(action: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.grecaptcha?.enterprise) {
      resolve(null);
      return;
    }
    window.grecaptcha.enterprise.ready(() => {
      window
        .grecaptcha!.enterprise.execute(SITE_KEY, { action })
        .then(resolve)
        .catch(() => resolve(null));
    });
  });
}
