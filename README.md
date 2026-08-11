# AquiAyudamosVE

Plataforma web para reportar y encontrar ayuda y necesidades en Venezuela (terremoto, agosto 2026). Los usuarios publican reportes geolocalizados de ayuda disponible o necesidades críticas, con confirmación comunitaria y un sistema de reputación/confianza que prioriza la información más fiable.

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma + MySQL ([backend/](backend/))
- **Frontend**: React + TypeScript + Vite + Tailwind + Leaflet (mapa) ([frontend/](frontend/))

## Funcionalidad principal

- Reportes geolocalizados por categoría (ayuda, necesidad, crítico, info), visibles en un mapa (Leaflet)
- Autenticación con JWT (access token en memoria, refresh token en cookie httpOnly)
- Confirmación comunitaria de reportes y sistema de reputación/confianza (nuevo → colaborador → colaborador confiable → voluntario verificado → organización → entidad institucional)
- Moderación: reportes marcados, panel de administración, registro de auditoría
- Subida de imágenes en reportes (procesadas con `sharp`)

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

## Despliegue

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para la guía completa de despliegue a producción (reverse proxy, variables de entorno, migraciones, checklist).

## Agentes de validación

Este repo incluye subagentes de Claude Code en [.claude/agents/](.claude/agents/) (`backend-validator`, `frontend-validator`, `deploy-readiness`) para validar typecheck, tests, build y configuración de despliegue antes de cada release.

## Licencia

MIT — ver [LICENSE](LICENSE).
