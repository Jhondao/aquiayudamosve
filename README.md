# AquiAyudamosVE

Ayuda donde más hace falta: plataforma para coordinar albergues, centros de acopio y necesidades comunitarias en cualquier departamento, municipio, vereda o barrio de Colombia — nacida como respuesta al terremoto de agosto de 2026 en Cali. Cualquiera puede reportar o pedir ayuda **sin crear cuenta**; la comunidad confirma o marca como incorrecta la información publicada, y un sistema de reputación/confianza prioriza lo más fiable y hace decaer lo que lleva mucho tiempo sin confirmar.

**En producción:** [aquiayudamosve.co](https://aquiayudamosve.co)

## Por qué existe

Durante una emergencia, la información sobre qué puntos necesitan ayuda, cuáles ya están saturados, y qué se necesita exactamente en cada uno, cambia cada pocos minutos y se dispersa en redes sociales, chats de WhatsApp y páginas improvisadas. AquiAyudamosVE le da a esa información una estructura que se puede filtrar por categoría y territorio (departamento/municipio, o "cerca de mí" con GPS), ver en un mapa, y — lo más importante — mantener actualizada mediante confirmaciones de la propia comunidad en vez de depender de que alguien la edite a mano. No está limitada a una lista cerrada de ciudades: cualquier lugar de Colombia se puede elegir de un catálogo o escribir a mano si no aparece.

La home no es una lista genérica de reportes: está organizada como un panel de situación —

1. **Situación actual**: conteo en vivo de centros de acopio, albergues, necesidades y solicitudes de transporte.
2. **Mapa** con todos los puntos, cada uno con su categoría visible sin necesidad de hacer clic.
3. **Necesidades urgentes**: ranking automático por volumen de reportes reales (no una lista fija).
4. **¿Cómo puedes ayudar?**: accesos directos por tipo de ayuda (donaciones, transporte, voluntariado).
5. **Todos los reportes**: la lista completa, filtrable, con las acciones de "Pedir ayuda" / "Reportar un punto".

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma + MySQL ([backend/](backend/))
- **Frontend**: React + TypeScript + Vite + Tailwind + Leaflet (mapa) ([frontend/](frontend/))
- **Almacenamiento de fotos**: Supabase Storage (S3-compatible) — [backend/src/lib/objectStorage.ts](backend/src/lib/objectStorage.ts)
- **Pieza visual para compartir**: `satori` (texto→SVG vectorizado con fuentes propias) + `sharp` (rasteriza a PNG) + `qrcode` — [backend/src/modules/share/](backend/src/modules/share/)
- **Despliegue actual**: Netlify (frontend) + Render (backend) + Aiven (MySQL) — ver sección [Despliegue](#despliegue) más abajo

## Funcionalidad principal

- Reportar y pedir ayuda **sin cuenta**: basta correo + celular; por debajo se crea un usuario "guest" (sin contraseña) que luego se puede reclamar registrándose con ese mismo correo ([backend/src/modules/reports/reports.service.ts](backend/src/modules/reports/reports.service.ts))
- Reportes geolocalizados por categoría (ayuda, necesidad, crítico, info), visibles en el mapa con su categoría como etiqueta y filtrables por departamento/municipio o categoría
- Ubicación flexible en cualquier lugar de Colombia (departamento → municipio del catálogo, vereda/corregimiento/barrio a mano, GPS, o "cerca de mí"): nunca bloquea una publicación porque el lugar no esté en una lista predeterminada ([frontend/src/components/LocationSelector.tsx](frontend/src/components/LocationSelector.tsx))
- Confirmación comunitaria de reportes (confirmar / dudoso / incorrecto) y sistema de reputación (nuevo → colaborador → colaborador confiable → voluntario verificado → organización → entidad institucional)
- Decaimiento de confianza (`STALE_HOURS_THRESHOLD`): un reporte sin confirmar por varias horas pierde puntaje automáticamente, para que la info vieja no aparente ser tan confiable como la reciente
- Actualizaciones sobre un reporte ya publicado (ej. "evacuación ordenada", "ya no se necesita más de esto") sin tener que crear uno nuevo
- Estado ampliado de necesidades: reportes de necesidad llevan cantidad necesaria/recibida y un estado (`necesitamos` → `en_camino` → `parcialmente_cubierto` → `cubierto`/`excedente`/`desactualizado`) que cualquiera de la comunidad puede actualizar, con un botón directo "Ya está cubierto — no traer más" para dejar de saturar un punto ya resuelto
- Compromisos de ayuda (`NeedCommitment`): cualquiera puede prometer "puedo cubrir X de esto" sobre una necesidad, con seguimiento propio (prometido → en camino → entregado/cancelado) separado de la cantidad recibida real, para no confundir una promesa con una entrega confirmada ([backend/src/modules/reports/reports.service.ts](backend/src/modules/reports/reports.service.ts))
- Compartir por WhatsApp: para reportes ya confirmados por la comunidad (o cubiertos/con excedente/institucionales) genera una pieza visual descargable con QR + texto pre-armado; para lo demás comparte solo el enlace con una advertencia — nunca una imagen que dé a entender que algo sin confirmar es un hecho. Los bots de WhatsApp/Telegram/Facebook ven una vista previa (imagen + título) real gracias a una puerta social server-rendered en `/r/:id` ([backend/src/modules/share/](backend/src/modules/share/))
- Evidencia en reportes: foto (procesada con `sharp` — se le quita el EXIF/GPS antes de subirla) y/o enlace de fuente externa
- Moderación: reportes marcados, panel de administración con vista de **todos** los reportes (no solo denunciados), acciones de ocultar / marcar falso / marcar no vigente / eliminar, registro de auditoría

## Estructura de datos y contenido

Las categorías del catálogo (`backend/prisma/seed.ts`, tabla `ReportCategory`) sí son datos reales del producto — corren en cualquier entorno. **El resto de `seed.ts` (usuarios y reportes de ejemplo) es solo para desarrollo local**, con contraseñas hardcodeadas y públicas en el código: no lo corras contra una base de producción (ver advertencia en [Base de datos](#base-de-datos) más abajo).

La base de producción también incluye reportes reales de Cali (albergues, centros de acopio, edificios afectados) agregados a partir de fuentes oficiales (Alcaldía de Cali) y medios verificados, no de una sola fuente sin contrastar. Cada dirección se geocodificó con Nominatim (OpenStreetMap) y, cuando el resultado era ambiguo (nombres de calle repetidos en comunas distintas), se contrastó contra noticias reales antes de confiar en la coordenada. Los puntos sin dirección verificable se eliminaron en vez de dejarlos con una ubicación inventada.

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

## Agentes de validación

Este repo incluye subagentes de Claude Code en [.claude/agents/](.claude/agents/) — se cargan solos al abrir el proyecto en Claude Code:

- `backend-validator`: typecheck, tests, drift de Prisma, build, cobertura de env vars
- `frontend-validator`: typecheck, build, wiring de la API, rutas, CSP del mapa
- `deploy-readiness`: secretos filtrados, CORS, config de storage, manejo de cookies cross-origin
- `seo-specialist`: meta tags, Open Graph/Twitter cards, robots.txt, sitemap.xml — a diferencia de los anteriores, puede aplicar los cambios directamente, no solo reportarlos

---

## Despliegue

Corre hoy en producción con este stack gratuito:

| Componente | Dónde | URL / referencia |
|---|---|---|
| Frontend | Netlify | https://aquiayudamosve.netlify.app |
| Backend | Render (free) | https://aquiayudamosve.onrender.com |
| Base de datos | Aiven MySQL (free) | ver [Base de datos](#base-de-datos) |
| Fotos de evidencia | Supabase Storage (free) | ver [Fotos de evidencia](#fotos-de-evidencia) |

Backend gratis se "duerme" tras 15 min sin tráfico (cold start ~1 min); base de datos y storage se pausan tras varios días sin uso (hay que reanudarlos a mano desde sus dashboards).

### Variables de entorno (backend)

Copia `backend/.env.example` a `backend/.env` y ajusta **todos** estos valores para producción — nunca dejes los valores de ejemplo:

| Variable | Descripción | Nota de producción |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto donde escucha el backend | Render lo inyecta automáticamente vía `process.env.PORT` |
| `DATABASE_URL` | Cadena de conexión MySQL | Usuario dedicado, no root |
| `CORS_ORIGIN` | Origen permitido para CORS | El dominio público del frontend |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de firma JWT | Generar nuevos, mínimo 32 caracteres aleatorios (`openssl rand -hex 32`). **Nunca reutilizar los valores `dev_..._change_me` de `.env.example`** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | Tiempos de expiración | Defaults razonables: `15m` / `7` días |
| `STALE_HOURS_THRESHOLD` | Horas sin confirmación antes de que un reporte empiece a decaer | Ajustar según criterio del producto |
| `STORAGE_ENDPOINT` / `STORAGE_REGION` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_BUCKET` / `STORAGE_PUBLIC_URL` | Credenciales S3 de Supabase Storage | Ver [Fotos de evidencia](#fotos-de-evidencia) |

El backend valida en el arranque ([backend/src/config/env.ts](backend/src/config/env.ts)) que `DATABASE_URL`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` existan. Las variables `STORAGE_*` se validan solo al subir una foto ([backend/src/lib/objectStorage.ts](backend/src/lib/objectStorage.ts)), así que en dev/tests pueden quedar vacías.

### Fotos de evidencia

Supabase Storage (S3-compatible, gratis, sin tarjeta — a diferencia de Cloudflare R2). Configuración:

1. Cuenta en [supabase.com](https://supabase.com) → proyecto nuevo.
2. **Storage** → **Create a new bucket** → nómbralo `evidence`, márcalo **Public bucket**.
3. **Project Settings → Storage → S3 Connection**: copia **Endpoint** y **Region** → `STORAGE_ENDPOINT` / `STORAGE_REGION`.
4. **S3 access keys → New access key** → copia Access Key ID y Secret (solo se muestran una vez).
5. `STORAGE_BUCKET=evidence`. `STORAGE_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/evidence`.

Caveat: un proyecto free de Supabase se pausa tras 7 días sin actividad — las fotos quedan inaccesibles hasta reanudarlo a mano en el dashboard.

### Base de datos

MySQL accesible por TCP desde fuera. **Aiven** funciona sin tarjeta (Northflank la pide incluso en el plan gratis).

1. Cuenta en [aiven.io](https://aiven.io) (GitHub/Google, sin tarjeta) → **Create service** → **MySQL** → plan **Free** → crear.
2. Espera a **Running** (1-2 min; el hostname no resuelve por DNS hasta entonces).
3. **Connection information**: copia host, puerto, usuario, contraseña, base (`defaultdb`).
4. Descarga el **CA Certificate** y guárdalo como `backend/prisma/ca.pem` (sí se commitea, es público, no un secreto).
5. `DATABASE_URL`, con el certificado obligatorio (sin él, Prisma falla con `P1011: certificate was not trusted`):
   ```
   mysql://<user>:<password>@<host>:<port>/defaultdb?sslcert=ca.pem
   ```
6. Migraciones: `DATABASE_URL="..." npx prisma migrate deploy` — nunca `migrate dev` en producción.

**`npm run seed` NO es solo para categorías.** Además del catálogo, inserta reportes falsos de demostración y usuarios de prueba con contraseñas fijas y públicas en el código (`admin@aquiayudamosve.org` / `Admin1234!`, entre otras). Como el repo es público, esas contraseñas son visibles para cualquiera — correrlo contra producción crea una cuenta admin real con contraseña conocida por todo internet. En producción, aplica solo las migraciones; el admin real se crea aparte con una contraseña generada (`openssl rand -base64 18`).

Aiven free se pausa tras inactividad, igual que Supabase — hay que reanudarlo a mano si eso pasa.

### Backend en Render

1. Cuenta en [render.com](https://render.com) → conecta el repo de GitHub.
2. **New → Web Service**: Root directory `backend`, Build command **`npm ci --include=dev && npm run build`**, Start command `npm run start`, Instance **Free**.
3. En **Environment**, agrega todas las variables de arriba. No definas `PORT`.

   **`--include=dev` es obligatorio.** Con `NODE_ENV=production` seteado, `npm ci` omite devDependencies por defecto — y `typescript` es una de ellas, necesaria para el build. Sin ese flag, Render usa un `tsc` de otra versión (de su imagen base) que puede fallar con errores que no se reproducen en local.

### Frontend en Netlify

1. [netlify.toml](netlify.toml) en la raíz ya proxea `/api/*` hacia el backend de Render — así el navegador ve todo como mismo origen y la cookie httpOnly de sesión sigue funcionando sin tocar código de autenticación. Si cambias de backend, actualiza la URL ahí.
2. Cuenta en [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → mismo repo. Netlify detecta `netlify.toml` solo.
3. Deploy. Luego vuelve a Render y actualiza `CORS_ORIGIN` con la URL exacta que te dio Netlify.

### Health check y checklist

`GET /api/health` → `{ status: "ok", time: "<ISO>" }` — úsalo como healthcheck.

- [ ] `npx tsc --noEmit` (backend) y `npm run build` (frontend) sin errores
- [ ] `npm test` en `backend/` pasa
- [ ] Secretos de producción generados de nuevo, nunca los de `.env.example`
- [ ] `CORS_ORIGIN` apunta al origen real del frontend
- [ ] `npx prisma migrate status` sin pendientes
- [ ] Frontend y backend bajo el mismo origen (proxy de `netlify.toml`)
- [ ] `STORAGE_*` probadas subiendo una foto real
- [ ] `GET /api/health` responde `200`

Puedes automatizar buena parte de esto con los subagentes en [.claude/agents/](.claude/agents/) (arriba).

## Licencia

MIT — ver [LICENSE](LICENSE).
