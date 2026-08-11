# Despliegue de AquiAyudamosVE

Guía práctica para desplegar el MVP: API en Node.js/Express + Prisma sobre MySQL, frontend estático React/Vite, y fotos de evidencia en Cloudflare R2.

Hay dos rutas documentadas. Elige una:

- **Opción A — VPS propio** (Hostinger VPS, Hetzner, etc.): todo en un servidor, mismo origen vía Nginx. Sin costos variables, control total.
- **Opción B — Gratis** (Netlify + Render + MySQL gestionado gratis): sin servidor propio, capas gratuitas de varios proveedores. Backend gratis se "duerme" tras inactividad (cold start ~1 min).

Ambas opciones comparten: variables de entorno (sección 1), Cloudflare R2 para fotos (sección 2), y migraciones de base de datos (sección 3).

## 1. Variables de entorno (backend)

Copia `backend/.env.example` a `backend/.env` y ajusta **todos** estos valores para producción — nunca dejes los valores de ejemplo:

| Variable | Descripción | Nota de producción |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto donde escucha el backend | `4000` (Render lo sobreescribe automáticamente vía `process.env.PORT`) |
| `DATABASE_URL` | Cadena de conexión MySQL | Usuario dedicado, no root |
| `CORS_ORIGIN` | Origen permitido para CORS | El dominio público del frontend (Netlify o tu dominio) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de firma JWT | Generar nuevos, mínimo 32 caracteres aleatorios (`openssl rand -hex 32`). **Nunca reutilizar los valores `dev_..._change_me` de `.env.example`** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | Tiempos de expiración | Los defaults (`15m` / `7` días) son razonables |
| `STALE_HOURS_THRESHOLD` | Horas sin confirmación antes de que un reporte empiece a decaer | Ajustar según criterio del producto |
| `R2_ACCOUNT_ID` | ID de cuenta de Cloudflare | Ver sección 2 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenciales del token API de R2 | Ver sección 2 |
| `R2_BUCKET` | Nombre del bucket R2 | Ver sección 2 |
| `R2_PUBLIC_URL` | URL pública base del bucket (sin `/` final) | Ver sección 2 |

El backend valida en el arranque ([backend/src/config/env.ts](backend/src/config/env.ts)) que `DATABASE_URL`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` existan — si falta alguna, falla inmediatamente en vez de arrancar con un secreto vacío. Las variables `R2_*` se validan solo al subir una foto ([backend/src/lib/r2.ts](backend/src/lib/r2.ts)), así que en dev/tests puedes dejarlas vacías si no vas a probar esa funcionalidad.

## 2. Fotos de evidencia (Cloudflare R2)

Los reportes permiten adjuntar imágenes, procesadas con `sharp` (recorte, recompresión, se les quita el EXIF) y subidas directo a Cloudflare R2 ([backend/src/modules/reports/uploads.ts](backend/src/modules/reports/uploads.ts), [backend/src/lib/r2.ts](backend/src/lib/r2.ts)) — **no se guardan en disco del backend**, así que esto funciona igual en un VPS que en un host efímero como Render.

Configuración (una sola vez):

1. Crea una cuenta gratis en [Cloudflare](https://dash.cloudflare.com/sign-up) si no tienes una.
2. En el dashboard, ve a **R2 Object Storage** → **Create bucket**. Nómbralo, por ejemplo, `aquiayudamosve-evidence`.
3. En el bucket, ve a **Settings** → **Public access** → habilita el acceso público (o conecta un dominio custom si prefieres). Copia la URL pública que te da (algo como `https://pub-xxxxxxxx.r2.dev`) — esa es tu `R2_PUBLIC_URL`.
4. Ve a **R2** → **Manage API tokens** → **Create API token**, con permisos de **Object Read & Write** limitado a ese bucket. Copia el **Access Key ID** y **Secret Access Key** que te muestra (solo se ven una vez).
5. Tu `R2_ACCOUNT_ID` está en la URL del dashboard de Cloudflare o en la página de resumen de R2 (a la derecha).
6. Rellena en `.env` / en las variables de entorno de tu host: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.

El plan gratis de R2 incluye 10 GB de almacenamiento y no cobra por tráfico de salida (a diferencia de S3), que alcanza sobrado para un MVP.

## 3. Base de datos

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

---

## Opción A — VPS propio

### A.1. Arquitectura

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
                 ┌─────────────────┐        ┌──────────────┐
                 │  MySQL 8         │        │  Cloudflare R2│ ◀ fotos de evidencia
                 └─────────────────┘        └──────────────┘
```

**Punto crítico, no es opcional:** el frontend llama a la API con rutas **relativas** (`/api/...`, ver [frontend/src/api/client.ts](frontend/src/api/client.ts)) y usa `credentials: "include"` para mandar la cookie httpOnly del refresh token con `sameSite: "lax"` ([backend/src/modules/auth/auth.routes.ts](backend/src/modules/auth/auth.routes.ts)). **Frontend y backend deben quedar detrás del mismo origen** (mismo dominio y protocolo) a través de un reverse proxy que enrute `/api/*` al backend y todo lo demás a los archivos estáticos del frontend. Si los sirves en dominios distintos sin ajustar esto, el login se rompe.

### A.2. Prerrequisitos del servidor

- Node.js 20+
- MySQL 8.0 (gestionado o en contenedor — `docker-compose.yml` trae uno solo para desarrollo local, no para producción)
- Nginx (o cualquier reverse proxy equivalente)
- Un proceso supervisor para el backend: `pm2` o un servicio `systemd`

### A.3. Build y arranque del backend

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

### A.4. Build del frontend

```bash
cd frontend
npm ci
npm run build           # genera frontend/dist (estático)
```

### A.5. Configuración de Nginx (reverse proxy de un solo origen)

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

---

## Opción B — Gratis (Netlify + Render + MySQL gestionado)

### B.1. Arquitectura

```
                 ┌───────────────────┐
  Usuarios ───▶  │  Netlify (frontend)│  https://tu-sitio.netlify.app
                 └─────────┬──────────┘
                    /api/* │ proxy (netlify.toml)
                            ▼
                 ┌───────────────────┐        ┌──────────────┐
                 │  Render (backend)  │───────▶│  Cloudflare R2│ fotos
                 │  free web service  │        └──────────────┘
                 └─────────┬──────────┘
                            ▼
                 ┌───────────────────┐
                 │  MySQL gestionado  │  (PandaStack / Northflank / etc.)
                 └───────────────────┘
```

El truco que evita tocar código de autenticación: [netlify.toml](netlify.toml) en la raíz del repo proxea `/api/*` hacia el backend de Render. El navegador ve todo como si viniera de tu dominio de Netlify (mismo origen), así que la cookie httpOnly del refresh token (`sameSite: "lax"`) sigue funcionando sin cambios.

**Limitación a aceptar:** el plan free de Render "duerme" el backend tras 15 min sin tráfico; la siguiente petición tarda ~1 min en responder mientras despierta.

### B.2. Backend en Render

1. Crea cuenta en [render.com](https://render.com), conecta tu repo de GitHub (`aquiayudamosve`).
2. **New** → **Web Service**, selecciona el repo.
3. Configura:
   - **Root directory**: `backend`
   - **Build command**: `npm ci && npm run build`
   - **Start command**: `npm run start`
   - **Instance type**: Free
4. En **Environment**, agrega todas las variables de la sección 1 (`DATABASE_URL`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `R2_*`, etc.). `NODE_ENV=production`. No definas `PORT` — Render lo inyecta automáticamente y el backend ya lo lee de `process.env.PORT` ([backend/src/config/env.ts](backend/src/config/env.ts)).
5. Deploy. Copia la URL que te da Render (`https://aquiayudamosve-backend.onrender.com` o similar).
6. Corre las migraciones una vez, desde tu máquina apuntando a la `DATABASE_URL` de producción:
   ```bash
   cd backend
   DATABASE_URL="<la url de producción>" npx prisma migrate deploy
   ```

### B.3. Base de datos MySQL gratis

Necesitas un MySQL accesible por TCP desde fuera (PlanetScale cerró su plan gratis en abril 2026). Alternativas gratis actuales: **PandaStack** o **Northflank** (crea una base MySQL, copia la cadena de conexión como `DATABASE_URL`). Ninguna de estas tiene el historial de confiabilidad de PlanetScale — para algo donde gente real reporta necesidades urgentes, considera este el eslabón más frágil del stack gratis y ten un plan para migrar a un MySQL gestionado de pago si el proyecto gana tracción real.

### B.4. Frontend en Netlify

1. Edita [netlify.toml](netlify.toml) en la raíz del repo: reemplaza `https://TU-BACKEND.onrender.com` por la URL real de tu servicio de Render (paso B.2.5).
2. Commitea y pushea ese cambio.
3. En [app.netlify.com](https://app.netlify.com), **Add new site** → **Import an existing project** → conecta el repo de GitHub.
4. Netlify detecta `netlify.toml` automáticamente (base `frontend`, build `npm run build`, publish `dist`) — no hace falta configurar nada más ahí.
5. Deploy. Copia la URL que te da Netlify (`https://tu-sitio.netlify.app`).
6. Vuelve a Render y actualiza la variable `CORS_ORIGIN` del backend con esa URL exacta de Netlify. Redeploy del backend.

### B.5. Verificación end-to-end

Después de desplegar ambos lados: abre el sitio de Netlify, regístrate, crea un reporte, y sube una foto de evidencia — confirma que la imagen se ve (viene de la URL pública de R2) y que el login persiste al recargar (confirma que la cookie cross-proxy funciona).

---

## 4. Health check

El backend expone `GET /api/health` → `{ status: "ok", time: "<ISO>" }` ([backend/src/app.ts](backend/src/app.ts)). Úsalo como endpoint de healthcheck en tu supervisor, load balancer o plataforma de despliegue.

## 5. Checklist previo a cada despliegue

- [ ] `npx tsc --noEmit` (backend) y `npm run build` (frontend) sin errores
- [ ] `npm test` en `backend/` pasa (suite de Vitest contra MySQL real — ver `backend/vitest.config.ts`, corre en serie porque comparte una sola base de datos)
- [ ] `.env` de producción con secretos JWT y contraseña de base de datos generados de nuevo — nunca los valores de `.env.example`
- [ ] `CORS_ORIGIN` apunta al origen público real del frontend
- [ ] `npx prisma migrate status` sin migraciones pendientes; luego `npx prisma migrate deploy`
- [ ] Frontend y backend accesibles bajo el **mismo origen** (Nginx en Opción A, proxy de `netlify.toml` en Opción B)
- [ ] Variables `R2_*` configuradas y probadas subiendo una foto real
- [ ] `GET /api/health` responde `200` tras el despliegue

Puedes automatizar buena parte de esta validación con los subagentes en [.claude/agents/](.claude/agents/) (`backend-validator`, `frontend-validator`, `deploy-readiness`) desde Claude Code.

## 6. Desarrollo local (referencia rápida)

```bash
docker compose up -d          # MySQL local
cd backend && npm ci && cp .env.example .env && npx prisma migrate dev && npm run dev
cd frontend && npm ci && npm run dev   # http://localhost:5173, proxy /api -> :4000
```

Las variables `R2_*` pueden quedar vacías en local si no vas a probar la subida de fotos — solo se validan cuando se usa esa funcionalidad.
