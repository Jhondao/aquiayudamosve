# Despliegue de AquiAyudamosVE

Guía práctica para desplegar el MVP: API en Node.js/Express + Prisma sobre MySQL, frontend estático React/Vite, y fotos de evidencia en Supabase Storage.

Hay dos rutas documentadas. Elige una:

- **Opción A — VPS propio** (Hostinger VPS, Hetzner, etc.): todo en un servidor, mismo origen vía Nginx. Sin costos variables, control total.
- **Opción B — Gratis** (Netlify + Render + MySQL gestionado gratis): sin servidor propio, capas gratuitas de varios proveedores. Backend gratis se "duerme" tras inactividad (cold start ~1 min).

Ambas opciones comparten: variables de entorno (sección 1), Supabase Storage para fotos (sección 2), y migraciones de base de datos (sección 3).

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
| `STORAGE_ENDPOINT` | Endpoint S3 de Supabase Storage | Ver sección 2 |
| `STORAGE_REGION` | Región del proyecto Supabase | Ver sección 2 |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Credenciales S3 de Supabase Storage | Ver sección 2 |
| `STORAGE_BUCKET` | Nombre del bucket | Ver sección 2 |
| `STORAGE_PUBLIC_URL` | URL pública base del bucket (sin `/` final) | Ver sección 2 |

El backend valida en el arranque ([backend/src/config/env.ts](backend/src/config/env.ts)) que `DATABASE_URL`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` existan — si falta alguna, falla inmediatamente en vez de arrancar con un secreto vacío. Las variables `STORAGE_*` se validan solo al subir una foto ([backend/src/lib/objectStorage.ts](backend/src/lib/objectStorage.ts)), así que en dev/tests puedes dejarlas vacías si no vas a probar esa funcionalidad.

## 2. Fotos de evidencia (Supabase Storage)

Los reportes permiten adjuntar imágenes, procesadas con `sharp` (recorte, recompresión, se les quita el EXIF) y subidas directo a Supabase Storage vía su API compatible con S3 ([backend/src/modules/reports/uploads.ts](backend/src/modules/reports/uploads.ts), [backend/src/lib/objectStorage.ts](backend/src/lib/objectStorage.ts)) — **no se guardan en disco del backend**, así que esto funciona igual en un VPS que en un host efímero como Render.

Se eligió Supabase Storage sobre Cloudflare R2 porque no pide tarjeta de crédito para el plan gratis. Trade-off a aceptar: **un proyecto gratis de Supabase se pausa tras 7 días sin actividad** — si la app no recibe tráfico esa semana, las fotos quedan inaccesibles hasta entrar al dashboard y reactivar el proyecto manualmente (no se pierden, solo quedan temporalmente inalcanzables). Si el proyecto gana tráfico real y constante, esto deja de ser un problema por sí solo; si no, hay que acordarse de revisarlo o migrar a un plan de pago / a R2 más adelante (el código es intercambiable: es un cliente S3 genérico en `objectStorage.ts`, cambiar de proveedor es solo cambiar variables de entorno).

Configuración (una sola vez):

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) y un proyecto nuevo (elige la región más cercana a tus usuarios).
2. En el proyecto, ve a **Storage** → **Create a new bucket**. Nómbralo, por ejemplo, `evidence`, y márcalo como **Public bucket**.
3. Ve a **Project Settings** → **Storage** → **S3 Connection**. Ahí ves el **Endpoint** (`https://<project-ref>.supabase.co/storage/v1/s3`) y la **Region** — esos son tus `STORAGE_ENDPOINT` y `STORAGE_REGION`.
4. En esa misma pantalla, **New access key** (o **S3 access keys**) → genera un par de claves. Copia el **Access Key ID** y **Secret Access Key** (solo se muestran una vez).
5. Tu `STORAGE_BUCKET` es el nombre que le pusiste en el paso 2 (`evidence`).
6. Tu `STORAGE_PUBLIC_URL` es `https://<project-ref>.supabase.co/storage/v1/object/public/evidence` (reemplaza `<project-ref>` por el de tu proyecto, y `evidence` por el nombre real del bucket).
7. Rellena en `.env` / en las variables de entorno de tu host: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`, `STORAGE_PUBLIC_URL`.

El plan gratis de Supabase incluye 1 GB de almacenamiento de archivos y 5 GB de tráfico de salida, suficiente para un MVP.

## 3. Base de datos

```bash
cd backend
npm ci
npx prisma migrate deploy   # aplica migraciones existentes — NUNCA "migrate dev" en producción
npx prisma generate
```

`migrate deploy` no crea migraciones nuevas ni pide confirmación interactiva; solo aplica las que ya están en `backend/prisma/migrations/`. El esquema define reportes, usuarios, reputación/confianza, categorías, organizaciones y moderación — revisa `backend/prisma/schema.prisma` si necesitas el detalle completo.

**`npm run seed` (`backend/prisma/seed.ts`) NO es solo para categorías — no lo corras contra producción tal cual.** Además del catálogo de categorías (eso sí es dato real, hace falta), inserta **reportes falsos de demostración y usuarios de prueba con contraseñas fijas y públicas en el código fuente** (`admin@aquiayudamosve.org` / `Admin1234!`, entre otras). Si el repo es público — el nuestro lo es — esas contraseñas quedan visibles para cualquiera. Correrlo contra producción crea una cuenta admin real con contraseña conocida por todo internet.

Para producción, solo aplica las migraciones (arriba). Las categorías se pueden sembrar aparte con un script que solo toque esa tabla, o edítalas manualmente. El primer usuario admin real hay que crearlo con una contraseña generada aparte (`openssl rand -base64 18` o similar), nunca con `npm run seed` tal cual está.

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
                 ┌─────────────────┐        ┌───────────────────┐
                 │  MySQL 8         │        │  Supabase Storage  │ ◀ fotos de evidencia
                 └─────────────────┘        └───────────────────┘
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
                 ┌───────────────────┐        ┌───────────────────┐
                 │  Render (backend)  │───────▶│  Supabase Storage  │ fotos
                 │  free web service  │        └───────────────────┘
                 └─────────┬──────────┘
                            ▼
                 ┌───────────────────┐
                 │  MySQL gestionado  │  (Aiven free tier)
                 └───────────────────┘
```

El truco que evita tocar código de autenticación: [netlify.toml](netlify.toml) en la raíz del repo proxea `/api/*` hacia el backend de Render. El navegador ve todo como si viniera de tu dominio de Netlify (mismo origen), así que la cookie httpOnly del refresh token (`sameSite: "lax"`) sigue funcionando sin cambios.

**Limitación a aceptar:** el plan free de Render "duerme" el backend tras 15 min sin tráfico; la siguiente petición tarda ~1 min en responder mientras despierta.

### B.2. Backend en Render

1. Crea cuenta en [render.com](https://render.com), conecta tu repo de GitHub (`aquiayudamosve`).
2. **New** → **Web Service**, selecciona el repo.
3. Configura:
   - **Root directory**: `backend`
   - **Build command**: `npm ci --include=dev && npm run build`
   - **Start command**: `npm run start`
   - **Instance type**: Free
4. En **Environment**, agrega todas las variables de la sección 1 (`DATABASE_URL`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STORAGE_*`, etc.). `NODE_ENV=production`. No definas `PORT` — Render lo inyecta automáticamente y el backend ya lo lee de `process.env.PORT` ([backend/src/config/env.ts](backend/src/config/env.ts)).

   **Ojo con `--include=dev`:** es obligatorio aquí. Con `NODE_ENV=production` seteado (necesario para runtime), `npm ci` por defecto omite las devDependencies — y `typescript` es una devDependency que el build (`tsc -p tsconfig.json`) necesita. Sin `--include=dev`, Render cae a un `tsc` distinto (de la imagen base) que puede tener una versión incompatible con `tsconfig.json` y fallar con errores confusos que no se reproducen en local.
5. Deploy. Copia la URL que te da Render (`https://aquiayudamosve-backend.onrender.com` o similar).
6. Corre las migraciones una vez, desde tu máquina apuntando a la `DATABASE_URL` de producción:
   ```bash
   cd backend
   DATABASE_URL="<la url de producción>" npx prisma migrate deploy
   ```

### B.3. Base de datos MySQL gratis (Aiven)

Necesitas un MySQL accesible por TCP desde fuera (PlanetScale cerró su plan gratis en abril 2026). Se probaron tres alternativas: **Northflank** pide tarjeta incluso para el plan gratis (verificación de pago, igual que Cloudflare); **PandaStack** no se llegó a probar por falta de documentación confiable. La que funcionó, sin tarjeta: **[Aiven](https://aiven.io)**.

1. Cuenta gratis en [aiven.io](https://aiven.io) (login con GitHub o Google, sin tarjeta).
2. **Create service** → tipo **MySQL** → plan **Free** (1 GB) → elige región → crear.
3. Espera a que el estado pase a **Running** (puede tardar 1-2 minutos; el hostname no resuelve por DNS hasta que termina).
4. En la pestaña **Connection information** del servicio, copia **Host**, **Port**, **User**, **Password** y el nombre de base (`defaultdb` por defecto).
5. En esa misma pantalla, descarga el **CA Certificate** (ícono de descarga) y guárdalo como `backend/prisma/ca.pem` en el repo — Prisma resuelve rutas de certificado relativas a la carpeta `prisma/`, y este archivo **sí se commitea** (es un certificado público, no un secreto).
6. Arma el `DATABASE_URL` así (nota el parámetro `sslcert`, obligatorio — Aiven usa una CA propia que Node no reconoce por defecto, y `?sslaccept=strict` sin el certificado da error `P1011: certificate was not trusted`):
   ```
   mysql://<user>:<password>@<host>:<port>/defaultdb?sslcert=ca.pem
   ```

Caveat a aceptar: el servicio gratis de Aiven se apaga tras un período de inactividad (avisan por correo antes) — igual que el caveat de Supabase Storage. Para algo donde gente real reporta necesidades urgentes, este es el eslabón más frágil del stack gratis; ten un plan para migrar a un MySQL gestionado de pago si el proyecto gana tracción real.

### B.4. Frontend en Netlify

1. Edita [netlify.toml](netlify.toml) en la raíz del repo: reemplaza `https://TU-BACKEND.onrender.com` por la URL real de tu servicio de Render (paso B.2.5).
2. Commitea y pushea ese cambio.
3. En [app.netlify.com](https://app.netlify.com), **Add new site** → **Import an existing project** → conecta el repo de GitHub.
4. Netlify detecta `netlify.toml` automáticamente (base `frontend`, build `npm run build`, publish `dist`) — no hace falta configurar nada más ahí.
5. Deploy. Copia la URL que te da Netlify (`https://tu-sitio.netlify.app`).
6. Vuelve a Render y actualiza la variable `CORS_ORIGIN` del backend con esa URL exacta de Netlify. Redeploy del backend.

### B.5. Verificación end-to-end

Después de desplegar ambos lados: abre el sitio de Netlify, regístrate, crea un reporte, y sube una foto de evidencia — confirma que la imagen se ve (viene de la URL pública de Supabase Storage) y que el login persiste al recargar (confirma que la cookie cross-proxy funciona).

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
- [ ] Variables `STORAGE_*` configuradas y probadas subiendo una foto real
- [ ] `GET /api/health` responde `200` tras el despliegue

Puedes automatizar buena parte de esta validación con los subagentes en [.claude/agents/](.claude/agents/) (`backend-validator`, `frontend-validator`, `deploy-readiness`) desde Claude Code.

## 6. Desarrollo local (referencia rápida)

```bash
docker compose up -d          # MySQL local
cd backend && npm ci && cp .env.example .env && npx prisma migrate dev && npm run dev
cd frontend && npm ci && npm run dev   # http://localhost:5173, proxy /api -> :4000
```

Las variables `STORAGE_*` pueden quedar vacías en local si no vas a probar la subida de fotos — solo se validan cuando se usa esa funcionalidad.
