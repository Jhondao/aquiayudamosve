# AquiAyudamosVE — contexto completo del proyecto

Este documento describe qué hace la aplicación y cómo está construida, con el nivel de detalle
necesario para trabajar en cualquier parte del código sin tener que releer todo el repo. Es
contexto para Claude Code, no documentación de usuario final (para eso está el [README.md](../README.md),
que es más corto y orientado a desarrollo/despliegue).

## 1. Qué es y por qué existe

**AquiAyudamosVE** es una plataforma web para coordinar ayuda tras el terremoto del 10 de agosto
de 2026 en Cali, Colombia. Cualquier persona puede reportar un punto de ayuda disponible (centro
de acopio, albergue, agua, etc.) o pedir ayuda (necesidad), **sin necesidad de crear una cuenta**.
La comunidad confirma o marca como incorrecta la información publicada, y un sistema de
reputación/confianza hace que lo más confirmado y reciente pese más que lo viejo o sin verificar.

La razón de ser: durante una emergencia la información sobre qué puntos necesitan ayuda, cuáles ya
están saturados y qué se necesita exactamente cambia cada pocos minutos y se dispersa en redes
sociales y chats. Esta app le da a esa información una estructura filtrable, visible en mapa, y que
se mantiene actualizada por confirmaciones de la propia comunidad en vez de depender de que alguien
la edite a mano.

**Producción:** frontend en `https://aquiayudamosve.netlify.app`, backend en
`https://aquiayudamosve.onrender.com`. Ver sección 9 (Despliegue).

**Estado del alcance:** la app está cerrada a **Cali únicamente** por ahora (`CITIES` en el
frontend solo tiene `"Cali"`, ver sección 4.3) — el modelo de datos soporta multi-ciudad
(`Pereira`, `Manizales`, `Armenia`, `Quibdó` están en el enum/constantes pero deshabilitadas en la UI).

## 2. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + Express 4 + Prisma 5 + MySQL 8 |
| Frontend | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + React Router 7 + Leaflet/react-leaflet (mapa) |
| Auth | JWT (access token en memoria) + refresh token en cookie httpOnly, rotado en cada uso |
| Fotos de evidencia | Supabase Storage (S3-compatible), subidas procesadas con `sharp` |
| Notificaciones | Web Push (`web-push` + VAPID), Service Worker propio + `vite-plugin-pwa` |
| PWA | `vite-plugin-pwa`, instalable, cache offline (network-first para `/api`, cache-first para tiles del mapa) |
| Tests | Vitest + Supertest (solo backend) |
| Infra local | Docker Compose (solo MySQL) |
| Infra producción | Netlify (frontend) + Render free (backend) + Aiven free (MySQL) + Supabase free (storage) |

Monorepo simple, sin workspace tool (npm normal): `backend/` y `frontend/` son dos proyectos npm
independientes, cada uno con su propio `package.json`, `node_modules`, tests y build.

## 3. Backend — arquitectura

`backend/src/` es un **monolito modular**: cada carpeta bajo `modules/` es una feature vertical con
sus propias rutas, schemas de validación (Zod) y lógica de negocio (`*.service.ts`). No hay
controllers/services genéricos compartidos entre módulos — cada `*.routes.ts` importa directo de su
`*.service.ts`.

```
backend/src/
  app.ts                 — createApp(): registra middleware global y monta cada router en /api/*
  index.ts               — arranca el server (app.listen)
  config/env.ts           — lee y valida process.env una sola vez, todo el resto del código importa `env` de aquí
  lib/
    prisma.ts             — instancia única de PrismaClient
    objectStorage.ts       — cliente S3 (Supabase Storage) para subir fotos de evidencia
    push.ts               — envío de Web Push (broadcastPush) usando web-push + VAPID
  middleware/
    auth.ts                — authenticate (lee JWT, no bloquea) + requireAuth + requireRole
    errorHandler.ts         — HttpError, notFoundHandler, errorHandler (nunca expone stack traces)
    rateLimit.ts            — 4 limiters (general, auth, createReport, confirmation)
    validate.ts             — validateBody/validateQuery con Zod
  modules/
    auth/           — registro, login, refresh, logout, /me — ver sección 4.1
    reports/         — crear/listar/confirmar/marcar/actualizar reportes, subir evidencia — el módulo más grande, ver sección 4.2
    categories/       — GET /api/categories (catálogo de categorías, público, solo lectura)
    moderation/        — panel de admin: listar todo, moderar, audit log — ver sección 4.4
    organizations/      — CRUD mínimo de organizaciones (solo admin puede crear/verificar)
    users/            — GET /api/users/me/reports (reportes propios del usuario logueado)
    push/             — VAPID public key, subscribe/unsubscribe — ver sección 4.5
    trust/           — trustScore.service.ts (algoritmo de confianza) + reputation.service.ts (reputación de usuario) — sin rutas propias, solo lógica que usan reports/moderation
    security/          — securityEvents.ts: audit trail best-effort de eventos de auth (login, logout, fallos)
  utils/
    geo.ts             — haversineMeters, coarsenCoordinates (para reportes isSensitive)
    tokens.ts           — firma/verificación de JWT, hash de refresh tokens
```

`app.ts` monta, en orden: `helmet` (con CSP que permite tiles de OSM) → `cors` (credentials: true,
origen = `CORS_ORIGIN`) → `express.json` (límite 1mb) → `cookieParser` → `authenticate` (global,
no bloquea) → `generalLimiter` (120 req/min) → `GET /api/health` → los routers de cada módulo →
`notFoundHandler` → `errorHandler`.

### 3.1 Variables de entorno (`backend/src/config/env.ts`)

Requeridas para arrancar: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (el proceso
lanza al importar `env` si faltan). Todo lo demás tiene default o es opcional y se valida
perezosamente solo cuando se usa esa feature específica:

- `STORAGE_*` (Supabase Storage): solo se valida al subir una foto de evidencia.
- `VAPID_*` (push): solo se valida al enviar un push; sin ellas, `/api/push/vapid-public-key`
  devuelve 404 y el frontend simplemente no ofrece activar notificaciones.
- `STALE_HOURS_THRESHOLD` (default 6): horas sin confirmación antes de que un reporte empiece a
  decaer en el algoritmo de confianza.
- `CORS_ORIGIN` (default `http://localhost:5173`).

## 4. Backend — módulos en detalle

### 4.1 Auth (`modules/auth/`)

JWT de dos tokens: **access token** (`JWT_ACCESS_TTL`, default 15m) devuelto en el body de la
respuesta y guardado solo en memoria en el frontend (nunca localStorage — ver `api/client.ts`), y
**refresh token** (opaco, 48 bytes random, `JWT_REFRESH_TTL_DAYS` días) en cookie **httpOnly**,
`sameSite: lax`, path `/api/auth`. El refresh token se **rota en cada uso** (`rotateRefreshToken`
revoca el usado y crea uno nuevo) — solo se guarda su hash SHA-256 en `Session.refreshTokenHash`,
nunca el token en claro.

Endpoints (`auth.routes.ts`):
- `POST /api/auth/register` — email+password+displayName. Si el email ya existe como cuenta real
  (`isGuest: false`) → 409 genérico. Si existe como **guest** (ver 4.2), lo "reclama": le pone
  password y `isGuest: false`, conservando el mismo `User.id` (y por tanto sus reportes/reputación).
- `POST /api/auth/login` — falla (401 genérico) si el usuario no existe, está borrado, o
  **no tiene `passwordHash`** (cuenta guest sin reclamar todavía — no se puede loguear sin password).
- `POST /api/auth/refresh` — lee la cookie, rota el refresh token.
- `POST /api/auth/logout` — revoca el refresh token actual, limpia cookie.
- `GET /api/auth/me` — perfil público del usuario autenticado (`requireAuth`).

Cada intento de login/registro/logout se registra best-effort en `SecurityEvent`
(`modules/security/securityEvents.ts`) — nunca lanza si falla, solo loguea a consola.

`middleware/auth.ts` separa dos conceptos:
- `authenticate` — middleware **global**, corre en cada request. Si hay `Authorization: Bearer`
  válido, setea `req.user`; si no hay o es inválido, deja `req.user` undefined **sin bloquear**.
- `requireAuth` — 401 si `req.user` no está seteado. Se usa explícitamente en las rutas que sí
  necesitan sesión.
- `requireRole(...roles)` — 403 si el rol no coincide.

### 4.2 Reports (`modules/reports/`) — el módulo central

Modelo `Report`: categoría, título, descripción, ciudad, ubicación aproximada (texto + lat/lng),
`status` (`active`/`inactive`/`hidden`), `trustScore`, `createdById`, `organizationId?`,
`isSensitive`, `lastConfirmedAt`. Relaciones: `confirmations`, `evidence`, `updates`, `flags`.

**Publicar sin cuenta (el cambio más importante del proyecto, agregado en el PR
"open-community-reporting"):** `POST /api/reports` **no requiere sesión.** Si `req.user` no está
seteado, el body debe traer `email` + `phone`, y `resolveGuestContact()` en `reports.service.ts`:

1. Busca un `User` por ese email.
2. Si existe y **no** es guest (`isGuest: false`, cuenta real con password) → **409**, rechaza —
   así nadie puede publicar a nombre de otra persona solo escribiendo su correo.
3. Si existe y es guest → lo reutiliza como `createdById` (actualiza el phone si cambió).
4. Si no existe → crea un `User` nuevo con `isGuest: true`, `passwordHash: null`,
   `displayName` derivado del email, y su `UserReputation` en `nuevo`/0.

Esto le da al sistema de confianza una identidad estable por reporte **sin introducir un modelo de
datos paralelo** — un guest es un `User` normal, solo que sin password. Ver también 4.1 (cómo se
"reclama" después via registro).

Categorías **sensibles** (`SENSITIVE_CATEGORY_KEYS`: `personas_heridas`, `personas_vulnerables`,
`rescate_requerido`) hacen que `createReport` llame `coarsenCoordinates()` (redondea a ~111m,
sección de privacidad) y reemplace `approxLocationText` por un texto genérico — nunca se persiste
una ubicación precisa para personas vulnerables.

Al crear un reporte de grupo `critico` o `necesidad`, se dispara `broadcastPush()` (fire-and-forget,
no bloquea la respuesta) con un emoji según el grupo.

Otros endpoints, todos con `requireAuth` (a propósito — publicar es lo que se abrió, actuar sobre
el reporte de otro sigue pidiendo cuenta):
- `POST /:id/confirm` — tipo `confirm`/`unsure`/`incorrect`. Único por `(reportId, userId, type)`
  (409 si se repite). Si es `confirm`, actualiza `lastConfirmedAt` y llama
  `rewardUsefulConfirmation` (reputación).
- `POST /:id/flag` — denuncia con motivo, marca el reporte para revisión de moderadores.
- `POST /:id/update` — actualización rápida de texto ("Sigue activo", "Se agotaron los
  suministros"...); si `deactivates: true`, pone el reporte en `status: inactive`.
- `POST /:id/evidence` — sube foto (`multer` en memoria, máx 5MB, jpeg/png/webp) y/o `sourceUrl`.
  La foto pasa por `sharp` antes de subirse: `rotate()` (aplica orientación EXIF), resize a máx
  1600x1600, recodifica a JPEG calidad 75 — esto **elimina el EXIF/GPS** del original antes de que
  salga del proceso, y la key es un UUID random (no sobrevive nada del nombre/ruta original).

Lectura (públicos, sin auth):
- `GET /` — lista paginada, filtrable por `city`/`group`/`institutional`.
- `GET /nearby` — reportes dentro de un radio (Haversine) de una categoría/ciudad — se usa en el
  formulario de reportar para avisar "ya existe un reporte similar cerca" antes de duplicar.
- `GET /:id` — detalle completo.

### 4.3 Sistema de confianza y reputación (`modules/trust/`)

Dos conceptos separados, cuidadosamente distintos en el código:

**`trustScore.service.ts` — confianza de un *reporte* individual** (0–100, `Report.trustScore`).
Modelo de dos partes:
- **Score de evento** (se recalcula y persiste con `recomputeReportTrustScore()` cada vez que hay
  una confirmación/evidencia/flag nueva): empieza en 20, suma por confirmaciones (5 normal / 10 de
  usuario "confiable" / 25 de organización — un usuario nunca puede confirmarse a sí mismo), +15
  si hay ≥3 confirmaciones independientes, +10 si hay evidencia adjunta, resta 10 por cada
  "incorrecto" de un usuario confiable, y -25 si hay ≥3 marcas de incorrecto acumuladas
  (`CONTRADICTION_THRESHOLD`).
- **Decaimiento por tiempo** (`applyDecay`, se aplica **al leer, no se persiste**): pasado
  `STALE_HOURS_THRESHOLD` desde la última confirmación, resta 2 puntos por cada hora extra sin
  confirmar. Así un reporte que nadie toca pierde puntaje solo, sin necesidad de un cron job.

`determineTrustLevel()` combina score + antigüedad + si está respaldado por organización + conteo
de "incorrecto" en un nivel legible (`sin_verificar` → `en_proceso` → `confirmado`, o
`institucional`/`desactualizada`/`cuestionada` según el caso). `trustLevelCopy` tiene el
label+descripción en español que ve el usuario para cada nivel.

**`reputation.service.ts` — reputación de un *usuario*** (`UserReputation.score`/`.level`, aparte
del score del reporte). Sube con confirmaciones útiles (+1 a quien confirma, +2 a quien creó el
reporte confirmado), baja -15 si un moderador marca su reporte como falso (`markFalse`), -10 por
sanción de moderación genérica. Niveles por umbral de score: `nuevo` (0) → `colaborador` (20) →
`colaborador_confiable` (60) → `voluntario_verificado` (120). `organizacion`/`entidad_institucional`
se asignan a mano (verificación de organización), nunca subiendo por score.

### 4.4 Moderación (`modules/moderation/`)

Todo bajo `requireAuth + requireRole("moderator", "admin")`, montado en `/api/admin`:
- `GET /reports/flagged` — reportes ocultos o con flags sin resolver.
- `GET /reports` — **todos** los reportes (no paginado, a propósito: revisión de admin espera ver
  todo), filtrable por city/status.
- `PATCH /reports/:id` — acción: `hide` / `unhide` / `markFalse` (oculta + trustScore a 0 +
  penaliza reputación del autor + resuelve flags) / `resolve` (ya no vigente, no es un juicio de
  veracidad) / `delete` (soft delete — `deletedAt`, desaparece de todo listado pero queda para
  auditoría).
- `GET /audit-logs` — últimas 100 entradas de `AuditLog`.

Cada acción de moderación crea **dos** registros: un `ModerationAction` (específico de reportes) y
un `AuditLog` (genérico, cualquier acción administrativa del sistema) — el historial nunca se
reescribe, solo se agrega.

### 4.5 Push notifications (`modules/push/` + `lib/push.ts`)

Suscripción **sin cuenta** (mismo criterio que reportar): `PushSubscription` no tiene `userId`,
solo `endpoint` (único, `VarChar(500)` — los endpoints de Apple/`web.push.apple.com` pasan los 191
caracteres default de Prisma, eso rompía el insert con 500 antes del ajuste), `p256dh`, `auth`.

- `GET /vapid-public-key` — pública, sin auth (la llave pública no es secreta, se manda al
  navegador). 404 si `VAPID_*` no está configurado.
- `POST /subscribe` / `POST /unsubscribe` — upsert/delete por endpoint, sin auth.

`broadcastPush()` manda a **todas** las suscripciones activas (no hay segmentación por ciudad ni
categoría todavía). Si una suscripción devuelve 404/410 (usuario desinstaló, limpió datos), se
borra sola en vez de reintentar para siempre.

## 5. Base de datos — modelo completo (`backend/prisma/schema.prisma`)

MySQL 8. UUIDs como PK en todo. Migraciones en `backend/prisma/migrations/`, aplicadas en orden:
`init` → `guest_reports` (passwordHash nullable + phone + isGuest) →
`push_subscriptions` → `widen_push_endpoint` (VarChar 500).

| Modelo | Para qué |
|---|---|
| `User` | Cuenta real o guest (`isGuest`, `passwordHash` nullable). `role`: citizen/moderator/admin |
| `UserReputation` | 1:1 con User — score + nivel de reputación |
| `Organization` | Entidad verificable (Cruz Roja, etc.); `verified` solo lo cambia un admin |
| `OrganizationMember` | Relación N:M usuario↔organización con rol |
| `ReportCategory` | Catálogo (grupo + key + label + orden) — dato de producto real, se siembra en todo entorno |
| `Report` | El reporte en sí — ver sección 4.2 |
| `ReportConfirmation` | confirm/unsure/incorrect, único por (reporte, usuario, tipo) |
| `ReportEvidence` | Foto y/o link de fuente |
| `ReportUpdate` | Actualización de texto sobre un reporte existente |
| `ReportFlag` | Denuncia con motivo, `resolved` boolean |
| `ModerationAction` | Acción de moderador sobre un reporte |
| `AuditLog` | Trail genérico de cualquier acción administrativa |
| `Session` | Refresh tokens activos (hash, no el token) |
| `SecurityEvent` | Eventos de auth (login/logout/fallos) — best-effort, nunca bloquea el flujo |
| `PushSubscription` | Suscripción push por endpoint, sin dueño |

`ReputationLevel` (enum): `nuevo` → `colaborador` → `colaborador_confiable` →
`voluntario_verificado` → `organizacion` → `entidad_institucional`.
`CategoryGroup` (enum): `ayuda` / `necesidad` / `critico` / `info`.

## 6. Frontend — arquitectura

```
frontend/src/
  main.tsx                — entry point: BrowserRouter > AuthProvider > App
  App.tsx                 — layout raíz: Navbar + Routes + Footer
  api/client.ts             — único punto de fetch al backend — ver 6.1
  context/AuthContext.tsx    — estado de sesión global (profile, login/register/logout)
  types.ts                 — tipos compartidos (Report, Profile, Category, ...)
  pages/                  — una por ruta, ver 6.2
  components/
    Navbar.tsx              — logo + nav responsive (hamburguesa en móvil)
    Footer.tsx               — nota de proyecto sin fines de lucro
    GuestContactFields.tsx    — inputs de email/celular reusados en NeedHelpPage y ReportFormPage
    MapView.tsx               — mapa Leaflet con markers por categoría
    ReportCard.tsx            — tarjeta de reporte en listados
    TrustBadge.tsx            — pill de nivel de confianza
    PushToggle.tsx            — activar/desactivar notificaciones push
    categoryStyle.ts           — GROUP_META: color/label/badge por CategoryGroup (única fuente de verdad de estilo por categoría)
  utils/time.ts              — relativeTime() ("hace 5 min")
  styles/index.css            — Tailwind + estilos globales (incluye .map-tag para las etiquetas del mapa)
```

### 6.1 `api/client.ts` — capa de red

Un único `request<T>()` centraliza todo el fetch. Detalles importantes:
- El **access token vive solo en memoria** (variable de módulo `accessToken`), nunca en
  localStorage/sessionStorage — así un XSS que lea storage no puede robar una sesión de larga
  duración. Se re-obtiene con `/api/auth/refresh` (cookie httpOnly) al cargar la app.
- En cualquier 401 (excepto en el propio `/refresh` o `/login`), intenta un refresh silencioso una
  vez (`tryRefresh`, deduplicado con `refreshInFlight` para no disparar refresh en paralelo si
  varias requests fallan a la vez) y reintenta la request original; si el refresh también falla,
  llama `onUnauthorized` (limpia el `profile` en `AuthContext`).
- `createReport()` acepta `email`/`phone` opcionales — se mandan solo cuando no hay sesión (ver
  6.3).

### 6.2 Rutas (`App.tsx`)

| Ruta | Página | Acceso |
|---|---|---|
| `/` | `HomePage` | público — hub de situación, ver 6.4 |
| `/necesito-ayuda` | `NeedHelpPage` | público (con o sin cuenta) |
| `/reportar` | `ReportFormPage` | público (con o sin cuenta) |
| `/reporte/:id` | `ReportDetailPage` | lectura pública; confirmar/actualizar/evidencia requiere login (redirige a `/login`) |
| `/login`, `/registro` | `LoginPage`, `RegisterPage` | público |
| `/perfil` | `ProfilePage` | requiere sesión |
| `/admin` | `AdminPage` | requiere rol `moderator`/`admin` |

### 6.3 Publicar sin cuenta (frontend)

`NeedHelpPage.tsx` y `ReportFormPage.tsx` **no** bloquean el formulario si `!profile` — antes lo
hacían (mostraban solo un botón "Inicia sesión"), eso se quitó a propósito. En su lugar:
- Si hay `profile`, el submit no manda `email`/`phone` (el backend usa `req.user.id`).
- Si no hay `profile`, se renderiza `<GuestContactFields>` (email + celular, ambos requeridos
  client-side antes de permitir el submit) y esos valores se mandan al backend.

En `ReportFormPage`, el botón "CONFIRMAR EXISTENTE" sobre reportes cercanos duplicados solo llama
`confirmReport` (requiere auth) si hay `profile`; si no, el botón se relee como "VER REPORTE" y solo
navega — evita una llamada 401 silenciosa para alguien sin cuenta.

### 6.4 HomePage — el hub post-desastre

No es una lista simple. Estructura de arriba a abajo (todo en un solo componente,
`frontend/src/pages/HomePage.tsx`):
1. **Hero** — título + dos CTAs que hacen scroll suave a otras secciones de la misma página
   (`comoAyudarRef`, `mapaRef`), no navegan a otra ruta.
2. `<PushToggle>` — invitación a activar notificaciones.
3. Aviso si hay reportes `cuestionada` (marcados incorrectos por la comunidad).
4. **Situación actual** — 4 tarjetas con conteos en vivo (centros de acopio, albergues,
   necesidades, transporte), calculadas client-side con `useMemo` sobre `allReports`.
5. **Mapa** (`MapView`, filtrado por lo que esté seleccionado más abajo).
6. **Necesidades urgentes** — ranking por volumen real de reportes por categoría (no una lista
   fija a mano), con severidad `CRÍTICA`/`ALTA` según el conteo.
7. **¿Cómo puedes ayudar?** — accesos directos (donaciones/transporte/voluntariado) que filtran la
   lista de abajo por categoría y hacen scroll a ella.
8. **Todos los reportes** — selector de ciudad, los dos CTA grandes (Pedir ayuda / Reportar un
   punto), filtros por grupo, y la lista completa (`ReportCard` por cada uno).

Todo carga una sola vez (`api.getReports({})`, sin filtros de servidor) y el filtrado por
ciudad/categoría/grupo es **client-side** (`useMemo` sobre `allReports`) — la paginación del
backend no se usa desde aquí.

### 6.5 PWA y notificaciones push (frontend)

`vite.config.ts` usa `vite-plugin-pwa` con `registerType: "autoUpdate"`. Estrategia de caché
deliberada para un sitio de emergencia: **network-first** para `/api/*` (intenta red, cae a caché
solo sin conexión, TTL 6h) — nunca sirve datos viejos como si fueran actuales; **cache-first** para
tiles de OpenStreetMap (no cambian, cachear agresivo ahorra datos). El manifest usa
`frontend/public/pwa-192.png` / `pwa-512.png` / `pwa-maskable-512.png`.

`push-sw.js` (en `frontend/public/`, cargado dentro del service worker generado vía
`workbox.importScripts`) agrega los listeners `push` y `notificationclick` sin salirse del modo
`generateSW` de Workbox.

`PushToggle.tsx` maneja el ciclo completo: detecta soporte (`serviceWorker`/`PushManager`),
detecta si el backend tiene VAPID configurado, y si el usuario ya bloqueó notificaciones. Detalle
no obvio: la public key y el `ServiceWorkerRegistration` se **precargan en un `useEffect`** al
montar, para que `enable()` pueda llamar `pushManager.subscribe()` como **primer await** — Safari/
iOS cancela en silencio el permiso si pasa demasiado tiempo entre el toque del usuario y la llamada
real a `subscribe()`.

### 6.6 Logo, marca y diseño responsive

`frontend/public/logo-mark.png` (isotipo, fondo transparente) se usa en el Navbar y como base de
`favicon.ico`/`apple-touch-icon.png`/`pwa-*.png`. Existe también `logo-lockup.png` (versión
completa con el wordmark "Aquí Ayudamos, Ve") que **no está commiteado** — quedó fuera a propósito
por ser un asset pesado (1.2MB) sin usar en ningún componente todavía.

`Navbar.tsx`: en desktop (`md:` y arriba) muestra todos los links inline. En móvil, solo se ve el
logo + botón "Necesito ayuda" + un ícono de hamburguesa — el resto (Inicio, Reportar,
Perfil/Salir o Ingresar, Panel admin si aplica) vive en un panel colapsable. El color de marca
(verde del isotipo) está en `tailwind.config.js` como `brand: "#4beb9b"`, separado de `accent`
(azul, `#3b6fe0` — el color de acción/UI, no de marca).

## 7. Flujos de punta a punta

**Reportar sin cuenta:** usuario en `/reportar` o `/necesito-ayuda` sin sesión → llena el
formulario + email/celular → `POST /api/reports` sin `Authorization` header →
`resolveGuestContact` crea/reutiliza un `User` guest → reporte creado con `trustScore: 20`,
`trustLevel: sin_verificar` → si es `critico`/`necesidad`, push a todos los suscritos → el guest
puede repetir con el mismo email y acumula reputación sobre el mismo `User.id`.

**Reclamar una identidad guest:** la misma persona va a `/registro` con el mismo email que usó
como guest + una password → `registerUser` detecta `isGuest: true` en el `User` existente → le
agrega password y pone `isGuest: false` → mismo `User.id`, sus reportes y reputación previos ya
están ahí, no hay migración de datos que hacer.

**Confirmar un reporte:** requiere sesión (login o cuenta reclamada). `POST /:id/confirm` →
`recomputeReportTrustScore` recalcula el score con el nuevo dato → si es `type: confirm`,
`rewardUsefulConfirmation` sube reputación de quien confirma y de quien creó el reporte.

**Un reporte decae solo:** nadie necesita correr un cron — cada vez que se **lee** un reporte
(`serializeReport`), `applyDecay` calcula cuánto restar según horas desde `lastConfirmedAt`. El
número guardado en DB (`trustScore`) es solo la parte "evento"; lo que ve el usuario siempre pasa
por decay al vuelo.

**Moderación:** un moderador ve `/admin` → `markFalse` sobre un reporte → oculta el reporte, pone
su score en 0, resuelve sus flags, y penaliza -15 la reputación de quien lo creó — todo en una sola
transacción de Prisma más una llamada aparte a `penalizeForFalseInformation`.

## 8. Desarrollo local

```bash
docker compose up -d          # MySQL local (único servicio en docker-compose.yml)

cd backend
npm ci
cp .env.example .env
npx prisma migrate deploy      # ver nota abajo sobre por qué deploy y no dev
npx prisma generate
npm run seed                   # categorías (dato real) + usuarios/reportes demo (SOLO dev)
npm run dev                    # http://localhost:4000

cd ../frontend
npm ci
npm run dev                    # http://localhost:5173 (proxy /api -> :4000)
```

**Notas específicas de este entorno de desarrollo (WSL sin red IPv6 funcional):**
- Node.js no viene preinstalado — se instaló vía NodeSource (Node 20).
- El entorno no resuelve IPv6, lo que rompe `npm install`/`apt` sin ayuda. Fix persistente:
  `NODE_OPTIONS=--dns-result-order=ipv4first` en `~/.bashrc`, y `-o Acquire::ForceIPv4=true` para
  `apt`.
- `prisma migrate dev` falla en local porque el usuario de la app no tiene permiso para crear la
  shadow database — se usa `prisma migrate deploy` en su lugar (aplica migraciones existentes sin
  necesitar ese permiso). Para crear una migración **nueva**, hay que escribir el SQL a mano en
  `backend/prisma/migrations/<timestamp>_<nombre>/migration.sql` en vez de dejar que Prisma la
  genere.
- `sharp` y `@rollup/rollup-linux-x64-gnu` a veces no bajan el binario nativo correcto en el primer
  `npm ci` (bug conocido de npm con optional dependencies) — si el `dev` truena con
  `Cannot find module '@rollup/rollup-linux-x64-gnu'` o el equivalente de `sharp`, reinstalar ese
  paquete específico (`npm install --no-save <paquete>`) sin tocar el lockfile.
- Para probar push notifications en local hace falta generar llaves VAPID propias:
  `node -e "console.log(require('web-push').generateVAPIDKeys())"` y ponerlas en `.env`.

Tests del backend: `cd backend && npm test` (Vitest, requiere la base de datos local corriendo).
No hay tests de frontend todavía (solo `tsc -b` como validación de tipos + `vite build`).

## 9. Despliegue

Ver [README.md § Despliegue](../README.md#despliegue) para la guía completa (variables de entorno
de producción, cómo crear el bucket de Supabase, cómo montar Aiven MySQL con el certificado CA,
config de Render/Netlify). Resumen:

| Componente | Dónde |
|---|---|
| Frontend | Netlify — `netlify.toml` en la raíz proxea `/api/*` al backend de Render (mismo origen, para que la cookie httpOnly funcione sin `SameSite=None`) |
| Backend | Render (free tier — se duerme tras 15 min sin tráfico) |
| Base de datos | Aiven MySQL (free) — requiere `backend/prisma/ca.pem` (sí se commitea, es público) |
| Fotos | Supabase Storage (free — se pausa tras 7 días sin actividad) |

**Nunca correr `npm run seed` contra producción** — además del catálogo de categorías (que sí es
dato real), inserta usuarios y reportes de demostración con contraseñas fijas y públicas en el
código (`admin@aquiayudamosve.org` / `Admin1234!`, entre otras). En producción solo se aplican
migraciones; el admin real se crea aparte con password generada.

## 10. Decisiones de diseño que no son obvias leyendo un solo archivo

- **Guest User en vez de un modelo "reporte anónimo" separado.** Se decidió modelar "publicar sin
  cuenta" como un `User` sin password en vez de agregar campos `guestEmail`/`guestPhone` a
  `Report`/`ReportConfirmation`/`ReportEvidence`/`ReportUpdate` por separado — así todo el sistema
  de reputación, confirmaciones y auditoría sigue funcionando sin tocar ni un solo otro módulo.
- **El decay de confianza nunca se persiste**, se calcula al leer. Evita necesitar un job
  programado corriendo contra toda la tabla `Report` solo para mantener los números actualizados.
- **Confirmar/denunciar/actualizar siguen pidiendo cuenta** aunque *publicar* ya no la pida — es
  una decisión consciente, no un descuido: publicar es la acción que no se puede permitir perder
  (alguien pidiendo ayuda en emergencia), mientras que actuar sobre el reporte de otro es una
  acción secundaria donde mantener la barra de confianza más alta tiene más sentido.
- **Un guest se resuelve por email, y un email que ya es cuenta real bloquea el guest-flow (409).**
  Sin esto, cualquiera podría publicar reportes "como" otra persona con solo escribir su correo —
  la reputación de esa persona quedaría manipulable por terceros.
- **`isSensitive` fuerza coordenadas imprecisas a nivel de servicio**, no de UI — así ninguna
  ubicación precisa de una categoría sensible llega siquiera a existir en la base de datos, en vez
  de confiar en que el frontend la oculte.
- **Las fotos de evidencia siempre se recodifican con `sharp` antes de subirse** (nunca se sube el
  archivo original tal cual) — esto es lo que elimina EXIF/GPS, no una limpieza aparte.
- **La categoría de un reporte determina si dispara push**, no una configuración por usuario
  todavía (`critico` y `necesidad` disparan a *todos* los suscritos) — no hay segmentación por
  ciudad o tipo de interés por ahora, aunque el modelo de datos (`PushSubscription` sin `userId`)
  ya está preparado para agregarla después si se decide asociar suscripciones a categorías.
