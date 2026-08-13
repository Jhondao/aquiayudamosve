import { useEffect } from "react";

const SITE_NAME = "AquiAyudamosVE";

/**
 * SPA sin SSR/prerendering: React Router cambia la URL en el navegador pero
 * `frontend/index.html` solo tiene un único <title> estático, así que sin
 * esto todas las rutas mostrarían el mismo título en la pestaña del
 * navegador, en el historial y en los resultados que Google arma tras
 * ejecutar JS (Googlebot sí corre JS, a diferencia de los bots de vista
 * previa de WhatsApp/Telegram/Facebook — esos leen el HTML crudo y para
 * ellos esto no cambia nada; ver /r/:id en el backend para esa parte).
 *
 * No toca meta description/OG — para eso hay `react-helmet-async`, pero no
 * hace falta traer esa dependencia solo para el <title>.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
