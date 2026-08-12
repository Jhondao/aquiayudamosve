# AquiAyudamosVE

Plataforma web para reportar y encontrar ayuda y necesidades durante una emergencia — nacida en respuesta al terremoto de agosto de 2026 en Cali, Colombia. Los usuarios publican reportes geolocalizados de ayuda disponible o necesidades críticas; la comunidad los confirma o los marca como incorrectos, y un sistema de reputación/confianza prioriza la información más fiable y hace decaer la que queda sin confirmar por mucho tiempo.

**En producción:** [aquiayudamosve.netlify.app](https://aquiayudamosve.netlify.app)

## Por qué existe

Durante una emergencia, la información sobre qué puntos necesitan ayuda, cuáles ya están saturados, y qué se necesita exactamente en cada uno, cambia cada pocos minutos y se dispersa en redes sociales, chats de WhatsApp y páginas improvisadas. AquiAyudamosVE intenta darle a esa información una estructura que se pueda filtrar por categoría y ciudad, ver en un mapa, y — lo más importante — mantener actualizada mediante confirmaciones de la propia comunidad en vez de depender de que alguien la edite a mano.

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma + MySQL ([backend/](backend/))
- **Frontend**: React + TypeScript + Vite + Tailwind + Leaflet (mapa) ([frontend/](frontend/))
- **Almacenamiento de fotos**: Supabase Storage (S3-compatible) — ver [backend/src/lib/objectStorage.ts](backend/src/lib/objectStorage.ts)
- **Despliegue actual**: Netlify (frontend) + Render (backend) + Aiven (MySQL) — ver [DEPLOYMENT.md](DEPLOYMENT.md)

## Funcionalidad principal

- Reportes geolocalizados por categoría (ayuda, necesidad, crítico, info), visibles en un mapa (Leaflet) y filtrables por ciudad/categoría
- Autenticación con JWT (access token en memoria, refresh token en cookie httpOnly — nunca en localStorage, para reducir el impacto de un XSS)
- Confirmación comunitaria de reportes (confirmar / dudoso / incorrecto) y sistema de reputación (nuevo → colaborador → colaborador confiable → voluntario verificado → organización → entidad institucional)
- Decaimiento de confianza (`STALE_HOURS_THRESHOLD`): un reporte sin confirmar por varias horas pierde puntaje automáticamente, para que la info vieja no aparente ser tan confiable como la reciente
- Evidencia en reportes: foto (procesada con `sharp` — se le quita el EXIF/GPS antes de subirla) y/o enlace de fuente externa
- Moderación: reportes marcados, panel de administración, registro de auditoría

## Estructura de datos y contenido

Las categorías del catálogo (`backend/prisma/seed.ts`, tabla `ReportCategory`) sí son datos reales del producto — corren en cualquier entorno. **El resto de `seed.ts` (usuarios y reportes de ejemplo) es solo para desarrollo local**, con contraseñas hardcodeadas y públicas en el código: no lo corras contra una base de producción. Ver la advertencia en [DEPLOYMENT.md](DEPLOYMENT.md#3-base-de-datos).

Aparte de los reportes creados por usuarios reales, la base de producción incluye un lote de reportes agregados manualmente a partir de un proyecto comunitario independiente que documentaba puntos críticos del terremoto de Cali — cada uno queda marcado con su fuente (`sourceUrl` en la evidencia) y con la ubicación explícitamente señalada como aproximada, ya que la fuente original no publicaba coordenadas.

## Desarrollo local

```bash
docker compose up -d          # MySQL local

cd backend
npm ci
cp .env.example .env
npx prisma migrate dev
npm run dev                    # http://localhost:4000

cd ../frontend
npm ci
npm run dev                    # http://localhost:5173 (proxy /api -> :4000)
```

Tests del backend: `cd backend && npm test` (Vitest, requiere la base de datos local corriendo).

Las variables `STORAGE_*` (Supabase Storage) pueden quedar vacías en local si no vas a probar la subida de fotos.

## Despliegue

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para la guía completa: arquitectura (VPS propio o el stack gratis Netlify+Render+Aiven que corre hoy en producción), variables de entorno, migraciones, y checklist previo a cada release.

## Agentes de validación

Este repo incluye subagentes de Claude Code en [.claude/agents/](.claude/agents/) — se cargan solos al abrir el proyecto en Claude Code:

- `backend-validator`: typecheck, tests, drift de Prisma, build, cobertura de env vars
- `frontend-validator`: typecheck, build, wiring de la API, rutas, CSP del mapa
- `deploy-readiness`: secretos filtrados, CORS, config de storage, manejo de cookies cross-origin

## Licencia

MIT — ver [LICENSE](LICENSE).
