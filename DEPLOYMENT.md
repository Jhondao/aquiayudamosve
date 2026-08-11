# Despliegue de AquiAyudamosVE

Guía práctica para desplegar el MVP: API en Node.js/Express + Prisma sobre MySQL, y frontend estático React/Vite.

## 1. Arquitectura del despliegue

```
                 ┌─────────────────────────┐
  Usuarios ───▶  │  Reverse proxy (Nginx)   │  https://tu-dominio
                 │  mismo origen            │
                 └──────────┬───────────────┘
                     /api/* │            resto de rutas
                             ▼                     ▼
                 ┌─────────────────┐   ┌─────────────────────┐
                 │  Backend (Node) │   │  Frontend estático   │
                 │  puerto 4000    │   │  frontend/dist        │
                 └────────┬─────────┘   └─────────────────────┘
                          ▼
                 ┌─────────────────┐
                 │  MySQL 8         │
                 └─────────────────┘
```

**Punto crítico, no es opcional:** el frontend llama a la API con rutas **relativas** (`/api/...`, ver [frontend/src/api/client.ts](frontend/src/api/client.ts)) y usa `credentials: "include"` para mandar la cookie httpOnly del refresh token. En dev esto funciona porque Vite hace de proxy (`frontend/vite.config.ts`). **En producción, frontend y backend deben quedar detrás del mismo origen** (mismo dominio y protocolo) a través de un reverse proxy que enrute `/api/*` al backend y todo lo demás a los archivos estáticos del frontend. Si los sirves en dominios distintos, el login se rompe (la cookie de refresh nunca llega) salvo que reescribas el cliente para usar `SameSite=None; Secure` cross-site, lo cual no está implementado.

## 2. Prerrequisitos del servidor

- Node.js 20+
- MySQL 8.0 (gestionado o en contenedor — `docker-compose.yml` trae uno solo para desarrollo local, no para producción)
- Nginx (o cualquier reverse proxy equivalente)
- Un proceso supervisor para el backend: `pm2` o un servicio `systemd` (docker también sirve si prefieres containerizar el backend)

## 3. Variables de entorno (backend)

Copia `backend/.env.example` a `backend/.env` en el servidor y ajusta **todos** estos valores para producción — nunca dejes los valores de ejemplo:

| Variable | Descripción | Nota de producción |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto donde escucha el backend | `4000` (o el que uses tras el proxy) |
| `DATABASE_URL` | Cadena de conexión MySQL | Usuario dedicado, no root |
| `CORS_ORIGIN` | Origen permitido para CORS | El dominio público del frontend |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de firma JWT | Generar nuevos, mínimo 32 caracteres aleatorios (`openssl rand -hex 32`). **Nunca reutilizar los valores `dev_..._change_me` de `.env.example`** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | Tiempos de expiración | Los defaults (`15m` / `7` días) son razonables |
| `STALE_HOURS_THRESHOLD` | Horas sin confirmación antes de que un reporte empiece a decaer | Ajustar según criterio del producto |

El backend valida en el arranque ([backend/src/config/env.ts](backend/src/config/env.ts)) que `DATABASE_URL`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` existan — si falta alguna, falla inmediatamente en vez de arrancar con un secreto vacío.

## 4. Base de datos

```bash
cd backend
npm ci
npx prisma migrate deploy   # aplica migraciones existentes — NUNCA "migrate dev" en producción
npx prisma generate
```

`migrate deploy` no crea migraciones nuevas ni pide confirmación interactiva; solo aplica las que ya están en `backend/prisma/migrations/`. El esquema define reportes, usuarios, reputación/confianza, categorías, organizaciones y moderación — revisa `backend/prisma/schema.prisma` si necesitas el detalle completo.

Semilla de datos inicial (categorías, etc.), opcional según si ya tienes datos:

```bash
npm run seed
```

## 5. Build y arranque del backend

```bash
cd backend
npm ci
npm run build          # compila TypeScript a backend/dist
npm run start           # node dist/index.js
```

En producción, no ejecutes `npm run start` directo en la terminal: usa un supervisor para que se reinicie solo si el proceso muere.

**Ejemplo con pm2:**
```bash
pm2 start dist/index.js --name aquiayudamosve-backend --cwd backend
pm2 save
```

**Ejemplo con systemd** (`/etc/systemd/system/aquiayudamosve-backend.service`):
```ini
[Unit]
Description=AquiAyudamosVE backend
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/ruta/al/repo/backend
EnvironmentFile=/ruta/al/repo/backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

## 6. Build del frontend

```bash
cd frontend
npm ci
npm run build           # genera frontend/dist (estático)
```

No hace falta variable de entorno para la URL de la API — el cliente usa rutas relativas `/api/...` a propósito, por el motivo explicado en la sección 1.

## 7. Configuración de Nginx (reverse proxy de un solo origen)

```nginx
server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # API — todo bajo /api va al backend Node
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend estático
    root /ruta/al/repo/frontend/dist;
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$host$request_uri;
}
```

El backend ya hace `app.set("trust proxy", 1)` ([backend/src/app.ts](backend/src/app.ts)) para leer correctamente la IP real del cliente detrás de un único proxy — no agregues más de un hop de proxy sin ajustar ese valor, o el rate limiting y los logs de seguridad usarán la IP equivocada.

## 8. Almacenamiento de imágenes subidas (`backend/uploads`)

Los reportes permiten adjuntar imágenes, procesadas con `sharp` y guardadas en disco local (`backend/uploads`, ver [backend/src/modules/reports/uploads.ts](backend/src/modules/reports/uploads.ts)). **Esto es disco local, no un bucket** — si despliegas en un contenedor o PaaS sin volumen persistente, las imágenes se pierden en cada redeploy o reinicio. Para producción real:

- VPS/servidor propio con systemd o pm2: basta con que `backend/uploads` esté en un volumen/disco persistente (ya está en `.gitignore` salvo `.gitkeep`, así que no se versiona).
- Contenedor/PaaS efímero: monta un volumen persistente en `backend/uploads`, o migra a almacenamiento de objetos (S3-compatible) — no implementado en el código actual, quedaría como mejora futura.

## 9. Health check

El backend expone `GET /api/health` → `{ status: "ok", time: "<ISO>" }` ([backend/src/app.ts](backend/src/app.ts)). Úsalo como endpoint de healthcheck en tu supervisor, load balancer o plataforma de despliegue.

## 10. Checklist previo a cada despliegue

- [ ] `npx tsc --noEmit` (backend) y `npm run build` (frontend) sin errores
- [ ] `npm test` en `backend/` pasa (suite de Vitest contra MySQL real — ver `backend/vitest.config.ts`, corre en serie porque comparte una sola base de datos)
- [ ] `.env` de producción con secretos JWT y contraseña de base de datos generados de nuevo — nunca los valores de `.env.example`
- [ ] `CORS_ORIGIN` apunta al dominio público real del frontend
- [ ] `npx prisma migrate status` sin migraciones pendientes; luego `npx prisma migrate deploy`
- [ ] Frontend y backend accesibles bajo el **mismo origen** vía reverse proxy (sección 1)
- [ ] `backend/uploads` en almacenamiento persistente
- [ ] `GET /api/health` responde `200` tras el despliegue

Puedes automatizar buena parte de esta validación con los subagentes en [.claude/agents/](.claude/agents/) (`backend-validator`, `frontend-validator`, `deploy-readiness`) desde Claude Code.

## 11. Desarrollo local (referencia rápida)

```bash
docker compose up -d          # MySQL local
cd backend && npm ci && cp .env.example .env && npx prisma migrate dev && npm run dev
cd frontend && npm ci && npm run dev   # http://localhost:5173, proxy /api -> :4000
```
