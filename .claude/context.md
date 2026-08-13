# AquiAyudamosVE — contexto completo del proyecto

Este documento describe qué hace la aplicación y cómo está construida, con el nivel de detalle
necesario para trabajar en cualquier parte del código sin tener que releer todo el repo. Es
contexto para Claude Code, no documentación de usuario final (para eso está el [README.md](../README.md),
que es más corto y orientado a desarrollo/despliegue).

## 1. Qué es y por qué existe

**AquiAyudamosVE** es una plataforma web para coordinar ayuda comunitaria en cualquier territorio de
Colombia, nacida como respuesta al terremoto del 10 de agosto de 2026 en Cali. Cualquier persona
puede reportar un punto de ayuda disponible (centro de acopio, albergue, agua, etc.) o pedir ayuda
(necesidad), **sin necesidad de crear una cuenta**, desde cualquier departamento, municipio, vereda,
corregimiento o barrio del país. La comunidad confirma o marca como incorrecta la información
publicada, y un sistema de reputación/confianza hace que lo más confirmado y reciente pese más que
lo viejo o sin verificar.

La razón de ser: durante una emergencia la información sobre qué puntos necesitan ayuda, cuáles ya
están saturados y qué se necesita exactamente cambia cada pocos minutos y se dispersa en redes
sociales y chats. Esta app le da a esa información una estructura filtrable, visible en mapa, y que
se mantiene actualizada por confirmaciones de la propia comunidad en vez de depender de que alguien
la edite a mano.

**Producción:** frontend en `https://aquiayudamosve.co` (dominio propio, confirmado en vivo —
apunta al mismo despliegue de Netlify que `https://aquiayudamosve.netlify.app`), backend en
`https://aquiayudamosve.onrender.com`. Ver sección 9 (Despliegue).

**Estado del alcance:** cobertura nacional (**"ACTUALIZACIÓN DEL PROMPT MAESTRO"** implementada) —
ya no hay ninguna lista cerrada de ciudades. `Report.departmentName`/`municipalityName` son texto
libre, nunca validados contra un catálogo (ver sección 4.2). Las 6 zonas del terremoto (Cali,
Pereira, Manizales, Armenia, Quibdó, Popayán) solo aparecen como accesos rápidos en la UI, no como
un límite de qué se puede reportar.

**Evolución hacia coordinación (otro documento, "PROMPT MAESTRO" original, y su continuación
"PROMPT MAESTRO v3"):** el usuario también pegó documentos que piden evolucionar la app de "mapa de
reportes" a un sistema de coordinación de necesidades y capacidades. **Ya implementado:** Fase 1
(estado ampliado de necesidades, sección 4.2), cobertura territorial nacional (sección 4.2/6.8), y
Fase A de v3 (`NeedCommitment` — compromisos parciales de ayuda con tracking de estado, sección
4.2/6.9). **Roadmap, no código todavía:** un módulo completo de ofertas/recursos "quiero ayudar"
(Fase B de v3), un motor de matching necesidad↔recurso (Fase D), y coordinación avanzada — alertas
de cercanía, puntos saturados, reclamar un punto (Fase E) — el documento mismo pide evolución
incremental, una fase a la vez, sin reemplazar lo que ya funciona.

**Compartir por WhatsApp (documento "PROMPT MAESTRO — COMPARTIR REPORTES CONFIRMADOS POR
WHATSAPP"):** ya implementado — ver sección 4.6/6.10. Genera una pieza visual descargable/compartible
solo para reportes que la comunidad ya confirmó, no para cualquier reporte (nunca "100% verificado").

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
  app.ts                 — createApp(): registra middleware global, monta cada router en /api/*, y /r fuera de /api
  index.ts               — arranca el server (app.listen)
  config/env.ts           — lee y valida process.env una sola vez, todo el resto del código importa `env` de aquí
  lib/
    prisma.ts             — instancia única de PrismaClient
    objectStorage.ts       — cliente S3 (Supabase Storage) para subir fotos de evidencia y piezas de compartir
    push.ts               — envío de Web Push (broadcastPush) usando web-push + VAPID
  middleware/
    auth.ts                — authenticate (lee JWT, no bloquea) + requireAuth + requireRole
    errorHandler.ts         — HttpError, notFoundHandler, errorHandler (nunca expone stack traces)
    rateLimit.ts            — 4 limiters (general, auth, createReport, confirmation)
    validate.ts             — validateBody/validateQuery con Zod
  modules/
    auth/           — registro, login, refresh, logout, /me — ver sección 4.1
    reports/         — crear/listar/confirmar/marcar/actualizar reportes, subir evidencia, compromisos de ayuda — el módulo más grande, ver sección 4.2
    categories/       — GET /api/categories (catálogo de categorías, público, solo lectura)
    moderation/        — panel de admin: listar todo, moderar, audit log — ver sección 4.4
    organizations/      — CRUD mínimo de organizaciones (solo admin puede crear/verificar)
    users/            — GET /api/users/me/reports (reportes propios del usuario logueado)
    push/             — VAPID public key, subscribe/unsubscribe — ver sección 4.5
    share/            — pieza visual + puerta social /r/:id para compartir por WhatsApp — ver sección 4.6
    trust/           — trustScore.service.ts (algoritmo de confianza) + reputation.service.ts (reputación de usuario) — sin rutas propias, solo lógica que usan reports/moderation
    security/          — securityEvents.ts: audit trail best-effort de eventos de auth (login, logout, fallos)
  utils/
    geo.ts             — haversineMeters, coarsenCoordinates (para reportes isSensitive)
    tokens.ts           — firma/verificación de JWT, hash de refresh tokens
```

`backend/assets/fonts/` (fuera de `src/`, junto a `prisma/`): `Inter-Regular.ttf` / `Inter-Bold.ttf`
(licencia OFL) — las fuentes que `satori` vectoriza para la pieza de compartir, ver 4.6.

`app.ts` monta, en orden: `helmet` (con CSP que permite tiles de OSM, el bucket de Supabase Storage
y Google Analytics — ver nota abajo) → `cors` (credentials: true, origen = `CORS_ORIGIN`) →
`express.json` (límite 1mb) → `cookieParser` → `authenticate` (global, no bloquea) →
`generalLimiter` (120 req/min) → `GET /api/health` → los routers de cada módulo → `/r` (fuera de
`/api`, ver 4.6) → `notFoundHandler` → `errorHandler`.

**La CSP de `helmet` solo protege lo que sirve *este* proceso Express** (respuestas JSON de `/api`
— irrelevante para CSP, un JSON nunca se navega como documento top-level — y el HTML de `/r/:id`,
donde sí importa). **No protege la SPA de React en absoluto**: el frontend lo sirve Netlify
directamente desde `dist/`, un proceso completamente distinto, y no hay `_headers` ni
`[[headers]]` en `netlify.toml` que le agregue CSP — confirmado en producción (`curl -sI
https://aquiayudamosve.co/` no trae header `Content-Security-Policy`). Si algún día se quiere una
CSP real para la SPA, tiene que configurarse del lado de Netlify (`frontend/public/_headers` o
`netlify.toml`), no editando `helmet()` aquí — eso solo cambiaría la CSP de `/r/:id` y de las
respuestas de `/api`.

### 3.1 Variables de entorno (`backend/src/config/env.ts`)

Requeridas para arrancar: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (el proceso
lanza al importar `env` si faltan). Todo lo demás tiene default o es opcional y se valida
perezosamente solo cuando se usa esa feature específica:

- `STORAGE_*` (Supabase Storage): solo se valida al subir una foto de evidencia.
- `VAPID_*` (push): solo se valida al enviar un push; sin ellas, `/api/push/vapid-public-key`
  devuelve 404 y el frontend simplemente no ofrece activar notificaciones.
- `RECAPTCHA_PROJECT_ID`/`RECAPTCHA_API_KEY` (reCAPTCHA Enterprise, ver 4.2 "Confirmar sin
  cuenta"): sin ellas, `verifyRecaptcha()` deja pasar la acción — el honeypot y
  `guestActionLimiter` siguen aplicando igual, así que esto nunca bloquea el arranque ni la
  funcionalidad, solo reduce una capa de la defensa anti-spam.
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

Modelo `Report`: categoría, título, descripción, ubicación (`departmentName`/`municipalityName`
requeridos, `localityName`/`approxLocationText` opcionales, `locationSource`, lat/lng — ver más
abajo), `status` (`active`/`inactive`/`hidden`), `trustScore`, `createdById`, `organizationId?`,
`isSensitive`, `lastConfirmedAt`, más `needStatus`/`quantityNeeded`/`quantityUnit`/`quantityReceived`
(Fase 1 del PROMPT MAESTRO original, ver más abajo). Relaciones: `confirmations`, `evidence`,
`updates`, `flags`.

**Publicar sin cuenta (el cambio más importante del proyecto, agregado en el PR
"open-community-reporting"):** `POST /api/reports` **no requiere sesión.** Si `req.user` no está
seteado, el body debe traer `email` + `phone`, y `resolveGuestContact()` en `reports.service.ts`:

1. Busca un `User` por ese email.
2. Si existe y **no** es guest (`isGuest: false`, cuenta real con password) → **409**, rechaza —
   así nadie puede actuar a nombre de otra persona solo escribiendo su correo.
3. Si existe y es guest → lo reutiliza como identidad (actualiza el phone si vino uno nuevo, nunca
   pisa el `displayName` que ya tenía).
4. Si no existe → crea un `User` nuevo con `isGuest: true`, `passwordHash: null`, la
   `displayName` que se le haya pasado (o derivada del email si no vino ninguna), y su
   `UserReputation` en `nuevo`/0.

Esto le da al sistema de confianza una identidad estable **sin introducir un modelo de datos
paralelo** — un guest es un `User` normal, solo que sin password. `phone`/`displayName` son
opcionales en la firma (`email` es el único dato realmente obligatorio, es la clave única de
identidad) — publicar exige ambos igual por su propio schema, pero **confirmar sin cuenta (abajo)
solo exige nombre + correo**, reusando la misma función. Ver también 4.1 (cómo se "reclama" después
vía registro).

Categorías **sensibles** (`SENSITIVE_CATEGORY_KEYS`: `personas_heridas`, `personas_vulnerables`,
`rescate_requerido`) hacen que `createReport` llame `coarsenCoordinates()` (redondea a ~111m,
sección de privacidad) y reemplace `approxLocationText` por un texto genérico — nunca se persiste
una ubicación precisa para personas vulnerables.

Al crear un reporte de grupo `critico` o `necesidad`, se dispara `broadcastPush()` (fire-and-forget,
no bloquea la respuesta) con un emoji según el grupo.

**Confirmar sin cuenta:** `POST /:id/confirm` — tipo `confirm`/`unsure`/`incorrect`, único por
`(reportId, userId, type)` (409 si se repite). Si es `confirm`, actualiza `lastConfirmedAt` y llama
`rewardUsefulConfirmation` (reputación). Tampoco requiere sesión (mismo criterio que publicar): sin
`req.user`, el body debe traer `displayName` + (`email` **o** `phone`, no ambos obligatorios — a
diferencia de publicar, que sí exige los dos juntos). Sin `userId` y sin ninguno de los dos
contactos, 400. Si solo llega `phone` (sin `email`), `syntheticEmailForPhone(phone)` genera un
correo placeholder determinístico (`tel-<dígitos>@guest.aquiayudamosve.local`, nunca mostrado en la
UI) para satisfacer la columna `email` (`NOT NULL @unique`) antes de llamar a
`resolveGuestContact()` — dos personas confirmando con el mismo celular terminan bajo la misma
identidad guest, a propósito, mismo criterio que ya aplica hoy por correo repetido.

Anti-spam para esta única puerta sin cuenta (antes, `requireAuth` ya cerraba el paso):
- **Honeypot**: `confirmSchema` tiene un campo `website` (`z.string().max(0)`) que un humano real
  nunca ve — el frontend lo oculta con CSS (`sr-only` + `aria-hidden`, nunca `display:none`/
  `type=hidden`, que un bot rudimentario sí detecta). Si llega con contenido, 400 automático en la
  validación del schema, sin lógica extra.
- **`guestActionLimiter`** (`middleware/rateLimit.ts`): 8 intentos / 10 min por IP, con
  `skip: (req) => Boolean(req.user)` — no le suma restricción a un usuario con sesión (ya cubierto
  por `confirmationLimiter`, 20/min), pero limita fuerte a quien no tiene cuenta, porque cada
  intento puede acuñar una identidad guest nueva.
- **reCAPTCHA Enterprise** (`lib/recaptcha.ts`, `requireRecaptchaForGuests`): el frontend genera un
  token (`frontend/src/utils/recaptcha.ts`, `grecaptcha.enterprise.execute`) solo cuando no hay
  sesión. El backend **solo bloquea si el token llegó y Google lo marcó inválido/con score bajo**
  (`< 0.5`) — un token ausente (script bloqueado por un ad-blocker, sin red, o `RECAPTCHA_PROJECT_ID`/
  `RECAPTCHA_API_KEY` sin configurar en `.env`) nunca bloquea por sí solo, para no convertir "quitar
  la barrera de cuenta" en "agregar una barrera de Google" para alguien real. La site key es pública
  y vive hardcodeada en el frontend (`index.html` + `utils/recaptcha.ts`); el project ID y el API
  key son privados, solo en `.env` del backend.

Otros endpoints, todos con `requireAuth` (a propósito — publicar/confirmar es lo que se abrió,
actuar sobre el reporte de otro de cualquier otra forma sigue pidiendo cuenta):
- `POST /:id/flag` — denuncia con motivo, marca el reporte para revisión de moderadores.
- `POST /:id/update` — actualización rápida de texto ("Sigue activo", "Se agotaron los
  suministros"...); si `deactivates: true`, pone el reporte en `status: inactive`.
- `POST /:id/evidence` — sube foto (`multer` en memoria, máx 5MB, jpeg/png/webp) y/o `sourceUrl`.
  La foto pasa por `sharp` antes de subirse: `rotate()` (aplica orientación EXIF), resize a máx
  1600x1600, recodifica a JPEG calidad 75 — esto **elimina el EXIF/GPS** del original antes de que
  salga del proceso, y la key es un UUID random (no sobrevive nada del nombre/ruta original).

Lectura (públicos, sin auth):
- `GET /` — lista paginada, filtrable por `departmentName`/`municipalityName`/`group`/`institutional`.
- `GET /nearby` — reportes dentro de un radio (Haversine) de una categoría — **sin** filtro de
  lugar (ver "Cobertura territorial nacional" más abajo, incluye por qué se quitó y el bug que eso
  arregló). Se usa tanto para "ya existe un reporte similar cerca" en el formulario de reportar
  como para el filtro "Cerca de mí" del home.
- `GET /:id` — detalle completo.

**Cobertura territorial nacional (`ACTUALIZACIÓN DEL PROMPT MAESTRO`):** la app ya no está cerrada
a una lista de ciudades. `departmentName`/`municipalityName` son **texto libre** en el schema Zod
(`z.string().trim().min(2).max(100)`, sin `z.enum()`) — el backend nunca valida contra ningún
catálogo, para que un lugar que no esté en ninguna lista nunca bloquee una publicación (esa regla
viene explícita del documento). `localityName` (vereda/corregimiento/barrio + su nombre juntos, ej.
"Vereda El Jardín") es opcional y también libre — no hay tipo/nombre separados, ni catálogo de
sub-nivel municipal. `locationSource` (`gps`/`catalog`/`manual`) documenta cómo se obtuvo el pin,
no si existe — todo reporte tiene `lat`/`lng` reales siempre, sin excepción (ver 6.7, el mapa
embebido de `LocationSelector` exige un pin en los 3 modos).

`approxLocationText` (antes obligatorio, la única forma de "punto de referencia") pasó a **opcional**
— con departamento/municipio/localidad ya estructurados, forzarlo siempre pediría el mismo dato dos
veces. Puede ser `null` en la respuesta de la API; el frontend hace fallback a `localityName` o al
municipio (ver `ReportCard.tsx`, `MapView.tsx`).

`findNearbyReports` (`reports.service.ts`) ya no filtra por lugar en absoluto — antes requería
`city` exacto en el `WHERE` *antes* de calcular distancia, lo que impedía detectar duplicados entre
dos reportes a 50m con distinto texto de ciudad (el bug que la sección 29 del documento señala
explícitamente). Ahora usa un **bounding-box** de lat/lng (aprovecha el índice
`@@index([lat,lng])` ya existente, no un índice espacial real) antes de filtrar por Haversine —
sin esto, un `take` fijo sin `orderBy` podía devolver 0 resultados a escala nacional aunque sí
hubiera reportes cercanos reales.

**Estado de necesidades (Fase 1 del PROMPT MAESTRO):** reportes de grupo `necesidad` (solo esos —
el resto queda con estos campos en `NULL`) tienen un `needStatus`: `necesitamos` → `en_camino` →
`parcialmente_cubierto` → `cubierto`/`excedente`/`desactualizado`, más `quantityNeeded`/
`quantityUnit`/`quantityReceived`. `quantityPending` (= `quantityNeeded - quantityReceived`, nunca
negativo) se calcula al serializar, no se persiste — mismo patrón que `applyDecay` en 4.3.
`createReport` decide `needStatus: "necesitamos"` explícitamente cuando la categoría es de ese
grupo (nunca vía `@default` de columna — eso lo filtraría a *todo* `Report.create()`, no solo a
necesidades). `quantityReceived` es un **total corriente**, no un ledger de contribuciones
individuales — cada actualización fija el nuevo total, no lo suma.

`POST /:id/need-status` (`requireAuth`, mismo nivel comunitario que confirm/flag/update, **no**
restringido al creador) actualiza `needStatus` y/o `quantityReceived` vía `updateNeedStatus()` en
`reports.service.ts`: valida que el reporte sea de grupo `necesidad` (400 si no), exige al menos un
campo en el body (400 si no — el schema Zod no puede usar `.refine()` porque
`validateBody(schema: AnyZodObject)` no acepta `ZodEffects`, así que el guard vive en el service),
genera un texto autogenerado ("Estado actualizado a...", "Recibidos N de M...") y lo agrega como
`ReportUpdate` — **reusa el timeline existente**, no hay tabla de historial nueva — y **también
actualiza `lastConfirmedAt`**: si no lo hiciera, un punto que la comunidad sí mantiene activamente
decaería igual que uno abandonado (ver 4.3), reintroduciendo por otra puerta el problema que esta
fase busca resolver.

En el frontend, un reporte `cubierto`/`excedente` se marca en verde en el mapa y las tarjetas
(`needStatusStyle.ts`), y sale del ranking "Necesidades urgentes" del home sin desaparecer del
listado — ver 6.4/6.7.

**Compromisos de ayuda / `NeedCommitment` (Fase A del "PROMPT MAESTRO v3"):** modelo separado
(`id, reportId, userId, quantity, unit?, status, estimatedArrival?, transportMethod?, note?`) que
registra promesas individuales de ayuda ("puedo cubrir 50L de esto") sobre reportes de grupo
`necesidad`. **Deliberadamente nunca suma a `quantityReceived`** — es un ledger de promesas, no de
entregas confirmadas; solo `updateNeedStatus` (arriba) toca `quantityReceived`, y solo cuando
alguien lo actualiza a mano. `status`: `committed` → `on_the_way` → `delivered` (o `cancelled` en
cualquier punto antes de `delivered`).

`POST /:id/commitments` (`requireAuth`, mismo nivel comunitario que confirm/flag/update/need-status
— cualquiera puede prometer ayuda, no solo el creador del reporte) crea el compromiso; si
`status: "on_the_way"`, `maybeBumpToEnCamino()` sube `Report.needStatus` de `necesitamos` →
`en_camino`, pero **nunca pisa una señal más fuerte** (`parcialmente_cubierto`/`cubierto`/
`excedente`) — mismo criterio de "nunca retroceder" que ya usa `updateNeedStatus`. Un compromiso que
nace `committed` (solo prometido, no en camino) no toca `needStatus` en absoluto.

`PATCH /:id/commitments/:commitmentId` es **el único endpoint de todo el módulo `reports` con
ownership check**: 403 si `req.user.id` no es el `userId` que creó el compromiso (comparado con
404 si el compromiso no existe o no pertenece a ese reporte). Todo lo demás en `reports.routes.ts`
es intencionalmente abierto a cualquier usuario autenticado — esta es la única excepción, porque un
compromiso es una promesa personal, no una acción comunitaria sobre el reporte de otro.

Para que la UI muestre los botones de actualizar un compromiso solo a su dueño **sin exponer la
identidad real de quien prometió ayuda** (la UI siempre dice "un colaborador", nunca un nombre),
`serializeReport`/`getReport` ganaron un parámetro `viewerId?` opcional — cada `NeedCommitment`
serializado expone `mine: boolean` (`viewerId === c.userId`) en vez del `userId` real.
`reports.routes.ts` pasa `req.user?.id` como `viewerId` en `GET /:id` y en cada acción que devuelve
el reporte actualizado (`confirmReport`/`flagReport`/`addReportUpdate`/`updateNeedStatus`/
`addEvidence`/`createCommitment`/`updateCommitment` todos hacen `return getReport(reportId, userId)`).

En el frontend, el bloque "Estado de la necesidad" (`ReportDetailPage.tsx`) gana una fila de 4
números (Necesarios / **Comprometidos** = suma de `quantity` de compromisos `committed`+
`on_the_way` — nunca resta de "Pendientes", que sigue siendo `quantityNeeded - quantityReceived` /
Recibidos / Pendientes), un formulario "Puedo ayudar con esto", y la lista de compromisos con
acciones "Marcar en camino"/"Marcar entregado"/"Cancelar" visibles únicamente cuando `mine: true` y
el estado no es terminal (`delivered`/`cancelled`).

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
  todo), filtrable por departmentName/municipalityName/status.
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

### 4.6 Compartir por WhatsApp (`modules/share/`)

Genera una pieza visual (PNG 1080x1350) + texto pre-armado para compartir un reporte por WhatsApp,
pero **solo para reportes que la comunidad ya confirmó** — el nombre del documento fuente es
literal ("compartir reportes CONFIRMADOS"), no "compartir cualquier reporte".

**`determineShareStatus(report)`** (`shareCard.service.ts`) clasifica en 6 estados: `confirmed` /
`institutional` / `covered` / `surplus` / `questioned` / `unconfirmed`. Solo los primeros 4 generan
imagen (`IMAGE_ELIGIBLE`); `questioned` (trustLevel `cuestionada`) y `unconfirmed` (todo lo demás,
incluye `status: inactive` forzado) devuelven `imageUrl: null` — solo enlace + texto de advertencia.
Un reporte `status: hidden` (oculto por moderación) se trata como **inexistente** para esta función
a propósito (`loadShareableReport` lanza 404) — a diferencia del resto de la app, donde `GET
/api/reports/:id` sí expone hoy un reporte oculto (hueco preexistente, no introducido aquí, ver
sección 10).

**Generación de imagen — por qué `satori` y no SVG+`sharp` directo:** `satori` (JS puro, sin
binario nativo) vectoriza el texto usando las fuentes exactas que le pasamos
(`backend/assets/fonts/Inter-{Regular,Bold}.ttf`, licencia OFL, extraídas del release oficial de
`rsms/inter` — el repo `google/fonts` solo trae la variable font, sin instancias estáticas), así el
resultado nunca depende de qué fuentes tenga el contenedor de Render. **Cero emoji/símbolos Unicode
en el render** (ni siquiera los glyphs ✓/◆/○ que ya usa `TrustBadge.tsx` en la UI web) — el riesgo
real es que Inter no tenga ese glyph y satori lo rendericé como tofu; los badges de estado son
píldoras de color + texto plano en español. `sharp` (ya dependencia) solo rasteriza el SVG final —
ya sin ningún `<text>` propio, satori ya lo vectorizó — a PNG. El QR se genera con `qrcode` en modo
`toBuffer({type: "png"})`, que usa `pngjs` (JS puro) en Node, no `canvas`/binario nativo.

**Nota de layout de satori/yoga:** `width: "fit-content"` no es un valor válido para el layout
engine (yoga) — para que un chip/badge se ajuste a su contenido en vez de estirarse al 100% del
padre (default de flexbox en un contenedor `column`), se usa `alignSelf: "flex-start"`. Verificado
renderizando y mirando el PNG resultado (la única forma real de confirmar que el layout se ve bien).

**Caché** (`cardCache`, `Map` en memoria por proceso — Render corre una sola instancia): keyed por
`reportId`, invalidada cuando cambia `lastConfirmedAt+needStatus+trustLevel+updatedAt` — nunca por
tiempo fijo. Solo cachea cuando hay imagen (`IMAGE_ELIGIBLE`); los estados sin imagen se recalculan
siempre (son baratos, no llaman a `satori`/`sharp`/Supabase).

**Puerta social `GET /r/:id`** (`shareGateway.routes.ts`, montada en `app.ts` como `app.use("/r",
...)`, **fuera de `/api`** — responde HTML, no JSON): HTML mínimo con `og:title`/`og:description`/
`og:image`/`og:url` + `<meta http-equiv="refresh" content="0;url=/reporte/:id">` + un `<a>` visible
de respaldo. **Sin `<script>` inline a propósito** — choca con la CSP `scriptSrc: ["'self'"]` que ya
existe en `app.ts` (misma que aplica a esta ruta, es el mismo `app` de Express), y el meta-refresh a
0 ya es instantáneo en cualquier navegador real. Bots de WhatsApp/Telegram/Facebook no ejecutan JS
ni siguen meta-refresh, solo leen las meta tags estáticas. `getPublicPreview()` envuelve
`getOrCreateShareCard()` en un try/catch que nunca deja caer un 500 — cualquier fallo (reporte no
encontrado, oculto, o el propio render/subida) cae a una página genérica "contenido no disponible"
con 200, nunca expone un stack trace ni rompe el link compartido.

**URL corta = el UUID del reporte, no un código nuevo**: el UUID ya es público en `/reporte/:id` y
en toda respuesta de la API — un código corto ganaría estética, no privacidad, y hubiera sido
justo la "infraestructura nueva" que el documento pide evitar. `/r/:id` ya es más corto que
`/reporte/:id`.

**`ShareEvent`**: telemetría mínima best-effort (`reportId, userId?, channel, createdAt` — nunca
destinatarios ni números), `recordShareEvent()` nunca lanza (mismo criterio que `broadcastPush`).
No se agrega al include de `reportWithRelations` — se escribe, nunca se sirve junto al reporte.

**Endpoints** (`reports.routes.ts`, ambos públicos): `GET /:id/share-card` → `{imageUrl, shareUrl,
whatsappText, status}`. `POST /:id/share-event` → `202`, fire-and-forget.

**Proxy en desarrollo/producción**: igual que `/api`, `/r` necesita su propio proxy — Netlify
(`netlify.toml`, redirect `/r/*` antes del catch-all de la SPA) y Vite dev (`vite.config.ts`,
`server.proxy["/r/"]`). **Con barra final a propósito** (`"/r/"`, no `"/r"`): Vite matchea el proxy
por prefijo de string crudo sobre la URL, así que la clave `"/r"` sin barra también capturaba
`/reporte/*` y `/registro` (ambas empiezan con "r") — un bug real que se encontró y corrigió durante
la verificación E2E, no algo hipotético. Netlify no tiene este problema (matchea por segmento de
ruta, no por prefijo de string), pero se dejó `/r/*` en ambos por claridad.

**Límite conocido, no resoluble desde este lado**: WhatsApp cachea agresivamente el preview ya
mostrado en un chat y no ofrece forma pública de invalidarlo — por eso todo texto de compartir
incluye "Consulta el estado actualizado", el link en sí siempre lleva al estado real aunque el
preview visual quede desactualizado en un chat viejo.

## 5. Base de datos — modelo completo (`backend/prisma/schema.prisma`)

MySQL 8. UUIDs como PK en todo. Migraciones en `backend/prisma/migrations/`, aplicadas en orden:
`init` → `guest_reports` (passwordHash nullable + phone + isGuest) →
`push_subscriptions` → `widen_push_endpoint` (VarChar 500) →
`need_status` (needStatus + quantityNeeded/Unit/Received en `Report`, con backfill de
`needStatus = 'necesitamos'` para los reportes de grupo `necesidad` ya existentes) →
`territory_coverage` (reemplaza la columna `city` por `departmentName`/`municipalityName`/
`localityName`/`locationSource`, `approxLocationText` pasa a nullable, con backfill de los 5
valores de `city` que existían a su departamento real, y `DROP COLUMN city` en el mismo paso — ver
"Cobertura territorial nacional" en 4.2 y la decisión correspondiente en la sección 10) →
`need_commitments` (tabla nueva `NeedCommitment`, sin backfill — no reemplaza ni toca ninguna
columna existente de `Report`, ver "Compromisos de ayuda" en 4.2) →
`share_events` (tabla nueva `ShareEvent`, sin backfill, ver "Compartir por WhatsApp" en 4.6).

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
| `NeedCommitment` | Promesa de ayuda de un usuario sobre un reporte de necesidad — ver 4.2 |
| `ShareEvent` | Telemetría best-effort de qué canal se usó para compartir — ver 4.6 |
| `ModerationAction` | Acción de moderador sobre un reporte |
| `AuditLog` | Trail genérico de cualquier acción administrativa |
| `Session` | Refresh tokens activos (hash, no el token) |
| `SecurityEvent` | Eventos de auth (login/logout/fallos) — best-effort, nunca bloquea el flujo |
| `PushSubscription` | Suscripción push por endpoint, sin dueño |

`ReputationLevel` (enum): `nuevo` → `colaborador` → `colaborador_confiable` →
`voluntario_verificado` → `organizacion` → `entidad_institucional`.
`CategoryGroup` (enum): `ayuda` / `necesidad` / `critico` / `info`.
`LocationSource` (enum): `gps` / `catalog` / `manual` — cómo se obtuvo el pin de un `Report`.
`NeedStatus` (enum, Fase 1): `necesitamos` / `en_camino` / `parcialmente_cubierto` / `cubierto` /
`excedente` / `desactualizado` — solo se usa en `Report` cuando `category.group === "necesidad"`.
`CommitmentStatus` (enum, Fase A de "PROMPT MAESTRO v3"): `committed` / `on_the_way` / `delivered` /
`cancelled` — estado de un `NeedCommitment`, ver 4.2.
`ShareChannel` (enum): `whatsapp` / `web_share` / `copy_link` / `save_image` — canal de un
`ShareEvent`, ver 4.6.

## 6. Frontend — arquitectura

```
frontend/src/
  main.tsx                — entry point: BrowserRouter > AuthProvider > GuestContactProvider > App
  App.tsx                 — layout raíz: Navbar + Routes + Footer
  api/client.ts             — único punto de fetch al backend — ver 6.1
  context/
    AuthContext.tsx          — estado de sesión global (profile, login/register/logout)
    GuestContactContext.tsx   — nombre/correo/celular de invitado recordado en memoria para la sesión, ver 6.11
  types.ts                 — tipos compartidos (Report, Profile, Category, ...)
  pages/                  — una por ruta, ver 6.2
  components/
    Navbar.tsx              — logo + nav responsive (hamburguesa en móvil)
    Footer.tsx               — nota de proyecto sin fines de lucro
    GuestContactFields.tsx    — inputs de nombre/correo/celular, reusados en NeedHelpPage/ReportFormPage/GuestConfirmModal
    GuestConfirmModal.tsx     — modal compartido por HomePage y ReportDetailPage para confirmar sin cuenta, ver 6.11
    LocationSelector.tsx      — GPS/catálogo/manual + mapa embebido de un pin, ver 6.8
    MapView.tsx               — mapa Leaflet con markers por categoría, centra con fitBounds (ver 6.8)
    ReportCard.tsx            — tarjeta de reporte en listados
    TrustBadge.tsx            — pill de nivel de confianza
    PushToggle.tsx            — activar/desactivar notificaciones push
    ShareSheet.tsx             — bottom sheet de compartir (WhatsApp/otra app/copiar/guardar), ver 6.10
    categoryStyle.ts           — GROUP_META: color/label/badge por CategoryGroup (única fuente de verdad de estilo por categoría)
    needStatusStyle.ts          — NEED_STATUS_META: emoji/badge/color de marcador por NeedStatus (Fase 1) — el texto sigue viniendo del backend (needStatusLabel)
  data/colombiaLocations.ts   — catálogo departamento→municipios de Colombia, ver 6.8
  utils/
    time.ts                  — relativeTime() ("hace 5 min")
    recaptcha.ts              — getRecaptchaToken(action), envuelve grecaptcha.enterprise, ver 6.11
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

`GuestContactFields.tsx` se reusa también dentro de `GuestConfirmModal.tsx` para confirmar sin
cuenta (ver 6.11 más abajo) — ganó props opcionales `displayName`/`setDisplayName` (solo se
renderiza el campo "Nombre" si vienen), `phoneRequired` (default `true`, sin cambiar el
comportamiento de los formularios de arriba — el modal lo pasa en `false`), `compact` (oculta el
encabezado "Publicando sin cuenta..." cuando el que lo usa ya tiene su propio texto, como el
modal) y `honeypot` (campo anti-spam, ver 4.2).

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
   fija a mano), con severidad `CRÍTICA`/`ALTA` según el conteo. Excluye reportes con
   `needStatus` `cubierto`/`excedente` (Fase 1) — un punto ya resuelto no debe seguir pareciendo
   urgente, aunque sigue visible (en verde) en el mapa y en "Todos los reportes".
7. **¿Cómo puedes ayudar?** — accesos directos (donaciones/transporte/voluntariado) que filtran la
   lista de abajo por categoría y hacen scroll a ella.
8. **Todos los reportes** — filtro de territorio (chips de zonas prioritarias + "Cerca de mí" +
   selects departamento/municipio, ver 6.7), los dos CTA grandes (Pedir ayuda / Reportar un punto),
   filtros por grupo, y la lista completa (`ReportCard` por cada uno).

**Carga de datos (`ACTUALIZACIÓN DEL PROMPT MAESTRO` — antes cargaba todo sin filtro):** `load()`
depende de `[department, municipality, nearMe]` y vuelve a pedir al servidor en cada cambio — sin
filtro de territorio, `api.getReports({ pageSize: 50 })` (nacional, paginado, más recientes
primero — el documento pide explícitamente no obligar a elegir territorio antes de entrar a la
app); con departamento/municipio, filtro server-side; con "Cerca de mí", `api.getNearby({ lat, lng,
radiusMeters: 20_000 })`. Solo el filtro por **grupo/categoría** (`GROUP_FILTERS`, `categoryFilter`)
sigue siendo client-side sobre lo que ya llegó — cambiar de grupo no debería disparar otro fetch.
Efecto colateral intencional: `stats`/`urgentNeeds` (`useMemo` sobre `allReports`) quedan acotados
al territorio filtrado automáticamente, porque `allReports` ya es lo que el servidor devolvió
filtrado — nadie en Chocó ve "situación actual" de Cali por accidente.

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

### 6.7 Estado de necesidades en el frontend (Fase 1)

`NeedHelpPage.tsx` y `ReportFormPage.tsx` (esta última solo cuando `group === "necesidad"`) tienen
dos inputs opcionales de cantidad+unidad junto al resto del formulario, mandados a
`api.createReport()` solo si se llenó cantidad. `ReportDetailPage.tsx` tiene una sección "Estado de
la necesidad" (visible solo si `report.category.group === "necesidad"`) con un botón directo
"✅ Ya está cubierto — no traer más" y un formulario genérico (select de los 6 estados + cantidad
recibida) que llaman `api.updateNeedStatus()`; ambos pasan por `guardedAction` (redirige a
`/login` si no hay sesión) — a diferencia de confirmar (ver 6.11 más abajo), marcar el estado de
una necesidad **sigue** pidiendo cuenta, no se abrió con este cambio. `ReportCard.tsx` y el `Popup`
de
`MapView.tsx` muestran el mismo badge de estado; `MapView.tsx` además cambia el **color del
marcador** a verde/azul cuando `needStatus` es `cubierto`/`excedente` — eso es lo que evita que
alguien lleve ayuda a un punto ya resuelto sin tener que abrir el popup para enterarse.

### 6.8 Cobertura territorial y `LocationSelector` (`ACTUALIZACIÓN DEL PROMPT MAESTRO`)

**`frontend/src/data/colombiaLocations.ts`**: `COLOMBIA_LOCATIONS: { name: string; municipalities: string[] }[]`
— 33 departamentos (32 + Bogotá D.C. como entidad propia), ~1,104 municipios reales, transcrito de
un dataset público basado en datos DANE (`marcovega/colombia-json`). El dataset original tenía
"Bogotá" listado como un municipio más dentro de Cundinamarca — se corrigió separándolo como su
propia entidad (Distrito Capital, no parte de Cundinamarca) al generar el archivo. Import estático
normal, sin lazy-loading (~17KB). Es **solo una ayuda de UI** — el backend nunca lo conoce ni valida
contra él (ver 4.2); si un lugar no aparece, `LocationSelector` deja escribirlo a mano.

**`LocationSelector.tsx`** — componente controlado (mismo patrón que `GuestContactFields.tsx`, un
objeto `LocationValue` único en vez de pares value/setValue) usado en `NeedHelpPage.tsx` y
`ReportFormPage.tsx`. Tres modos (botones, ninguno preseleccionado al montar):
- **Usar mi ubicación** — generaliza el único uso real de `navigator.geolocation` que existía antes
  (`ReportFormPage.useMyLocation`). Coloca el pin automáticamente, pero **igual muestra los selects
  de departamento/municipio** del catálogo debajo — no hay reverse-geocoding, GPS solo resuelve el
  pin, nunca el texto administrativo.
- **Buscar lugar** — selects progresivos departamento → municipio (municipio deshabilitado hasta
  elegir departamento; las opciones de municipio siempre se filtran dentro del departamento ya
  elegido, nunca por nombre global — hay municipios con el mismo nombre en departamentos distintos).
  Al completar ambos, llama `api.getReports({departmentName, municipalityName, pageSize: 20})` para
  centrar el mapa embebido con `fitBounds` sobre reportes ya existentes ahí; sin reportes previos,
  cae a vista nacional.
- **Escribir ubicación** — inputs de texto libre para departamento/municipio (mismo límite que el
  backend, sin validar contra el catálogo — nunca bloquea) + `localityName` opcional.

**El hueco que resuelve el mapa embebido de un solo pin:** el catálogo público no trae centroides
por municipio (~1,104 de ellos), así que no hay forma de derivar `lat`/`lng` automáticamente en los
modos "buscar lugar" o "escribir ubicación" sin GPS. Los 3 modos terminan en el mismo mapa
interactivo (`useMapEvents({click})` + `CircleMarker`, nunca `Marker` — evita el bug clásico del
ícono default de Leaflet roto por el bundling de Vite, mismo criterio que ya usaba `MapView.tsx`);
el usuario siempre coloca o confirma un pin con un clic antes de poder publicar. `locationSource`
(`gps`/`catalog`/`manual`) documenta cómo se llegó a ese pin, nunca si existe — todo reporte tiene
coordenadas reales siempre.

**`MapView.tsx`** ya no centra por ciudad (no hay coordenadas por municipio que usar) — el nuevo
`FitToReports` llama `map.fitBounds()` sobre los marcadores de reportes realmente visibles, con
fallback a una vista de Colombia completa (`[4.5, -74.3]`, zoom 5) cuando no hay ninguno. El prop
`city` desapareció del componente por completo.

### 6.9 Compromisos de ayuda en el frontend (Fase A de "PROMPT MAESTRO v3")

Dentro de la misma sección "Estado de la necesidad" de `ReportDetailPage.tsx` (6.7), cuando
`report.quantityNeeded != null` aparece una fila de 4 números (Necesarios / Comprometidos /
Recibidos / Pendientes) — "Comprometidos" es un valor derivado en el propio componente
(`report.needCommitments.filter(committed|on_the_way).reduce(sum quantity)`), no viene del backend.
Debajo, un formulario "Puedo ayudar con esto" (cantidad + unidad + checkbox "Voy en camino ahora"
que decide el `status` inicial y revela ETA/transporte opcionales) llama `api.createCommitment()`
— mismo `guardedAction` que el resto de acciones (redirige a `/login` sin sesión). La lista de
compromisos (`COMMITMENT_STATUS_META` en el propio archivo, mismo patrón que `NEED_STATUS_META`)
solo muestra botones "Marcar en camino"/"Marcar entregado"/"Cancelar" en las tarjetas donde
`c.mine === true` y el estado no es terminal — el backend nunca manda el `userId` real de quien
prometió ayuda, así que la UI no tiene forma de mostrar esos controles sobre el compromiso de otro
aunque quisiera.

### 6.10 Compartir por WhatsApp en el frontend

**`ShareSheet.tsx`** — bottom sheet controlado por `open`/`onClose`. Al abrirse llama
`api.getShareCard(reportId)`; si `imageUrl` es `null` muestra una advertencia ("⚠️ Esta información
aún no está confirmada...") en vez de la imagen, y el botón "Guardar pieza" queda deshabilitado —
nunca hay nada que descargar si no se generó pieza. Botones y su fallback:
- **WhatsApp** — abre `https://wa.me/?text=<whatsappText>` en una pestaña nueva.
- **Otra app** — intenta `navigator.share({files: [...]})` con el PNG descargado vía `fetch()` si
  `navigator.canShare({files})` lo soporta; si no, cae a `navigator.share({text, url})`; si tampoco
  hay soporte (o el usuario cancela, o falla el `fetch` por CORS del bucket), cae al mismo flujo de
  WhatsApp. Todo el fallback vive en un único `try/catch`.
- **Copiar enlace** — `navigator.clipboard.writeText(shareUrl)` + aviso "Enlace copiado."
- **Guardar pieza** — `<a download>` sintético al `imageUrl`.

Cada acción llama `api.recordShareEvent(reportId, channel)` sin esperar la respuesta ni bloquear la
UI (mismo criterio *fire-and-forget* que el backend usa para `broadcastPush`).

**Botón "COMPARTIR"** en `ReportDetailPage.tsx` — en la misma fila que confirmar/denunciar, pero
**sin pasar por `guardedAction`**: compartir un reporte público no requiere sesión, a diferencia de
confirmar/denunciar/actualizar.

**Banners de CTA tras una transición de estado** — ambos capturan el estado *antes* del `await` para
detectar si la acción fue la que causó la transición (y no mostrar el banner si el reporte ya estaba
en ese estado):
- `confirmAsGuestOrUser("confirm")` (ver 6.11 — el nombre de la función cambió cuando confirmar
  dejó de requerir cuenta, ya no es solo "confirm and offer share"): si `trustLevel` pasa a
  `confirmado`/`institucional` por primera vez, banner "Este reporte ya está confirmado por la
  comunidad." → "Compartir con mi comunidad".
- `markCoveredAndOfferShare()`: si `needStatus` pasa a `cubierto` por primera vez, banner "¡Gracias
  por actualizar!" → "Compartir actualización por WhatsApp".

Ambos banners abren el mismo `<ShareSheet>` montado al final del componente — no hace falta pasarle
una variante, el backend recalcula `status` sobre el reporte ya actualizado.

### 6.11 Confirmar sin cuenta (frontend)

**Dos puntos de entrada, un solo flujo compartido.** El botón "CONFIRMAR" existe en dos lugares
independientes — la tarjeta de cada reporte en la lista del home (`ReportCard.tsx`, vía el
`onConfirm` que le pasa `HomePage.tsx`) y los tres botones de `ReportDetailPage.tsx`
(CONFIRMAR/NO ESTOY SEGURO/REPORTAR INCORRECTO) — y los dos tenían que dejar de pedir cuenta a la
vez; arreglar solo uno deja al otro silenciosamente redirigiendo a `/login` (bug real detectado
después de un primer intento que solo tocó `ReportDetailPage.tsx`).

**`GuestContactContext`** (`frontend/src/context/GuestContactContext.tsx`, montado en `main.tsx`
junto a `AuthProvider`) guarda `{ displayName, email?, phone? } | null` **en memoria, nunca
persistido** (mismo criterio que el access token en `api/client.ts`) — se pide una sola vez por
visita/pestaña: quien confirma varios reportes seguidos (en el home o en detalle, da igual) no
vuelve a escribir su nombre/contacto cada vez.

**`GuestConfirmModal.tsx`** — modal compartido por ambas páginas. Se abre solo cuando `!profile &&
!guestContact`; si ya hay `guestContact` guardado, ninguna página vuelve a mostrar nada, confirma
directo. Copy explícito: *"Solo tu nombre y tu correo o celular — no creamos ninguna cuenta ni
contraseña"* — respuesta directa a que esto **no** debe sentirse como un registro. Pide nombre +
(correo **o** celular, no ambos — el propio modal valida "al menos uno" antes de permitir enviar,
mismo criterio que el backend). Al enviar: `rememberGuestContact()` guarda el contacto en el
contexto (para no volver a preguntar) y ejecuta la acción que estaba pendiente
(`pendingConfirmType`/`pendingConfirmId` según la página).

En ambas páginas, cada botón llama una única función (`confirmAsGuestOrUser(type)` en
`ReportDetailPage.tsx`, `handleConfirm(id)` en `HomePage.tsx`) que **nunca pasa por
`guardedAction`** (ese helper redirige a `/login`, exactamente la barrera que se quitó): con
`profile`, confirma directo; sin `profile` pero con `guestContact` ya guardado, confirma directo
con esos datos; sin ninguno de los dos, abre `GuestConfirmModal`.

`frontend/src/utils/recaptcha.ts#getRecaptchaToken(action)` envuelve
`grecaptcha.enterprise.execute()` en una promesa que resuelve a `null` (nunca rechaza) si el script
no cargó — se pide el token solo cuando se confirma como invitado, y se manda tal cual (aunque sea
`null`) al backend, que decide si bloquea o no (ver 4.2, `requireRecaptchaForGuests`: un token
ausente nunca bloquea por sí solo). En local, el badge de reCAPTCHA muestra "Localhost is not
supported by this site key" — normal y esperado, la site key está registrada para los dominios de
producción, no para desarrollo; el flujo sigue funcionando igual porque el backend no exige el
token, solo lo verifica si llegó.

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

**Confirmar un reporte:** con sesión o sin ella (ver 4.2 "Confirmar sin cuenta" — sin sesión, nombre
+ correo resuelven una identidad guest vía `resolveGuestContact`, igual que publicar). `POST
/:id/confirm` → `recomputeReportTrustScore` recalcula el score con el nuevo dato → si es `type:
confirm`, `rewardUsefulConfirmation` sube reputación de quien confirma y de quien creó el reporte.

**Un reporte decae solo:** nadie necesita correr un cron — cada vez que se **lee** un reporte
(`serializeReport`), `applyDecay` calcula cuánto restar según horas desde `lastConfirmedAt`. El
número guardado en DB (`trustScore`) es solo la parte "evento"; lo que ve el usuario siempre pasa
por decay al vuelo.

**Moderación:** un moderador ve `/admin` → `markFalse` sobre un reporte → oculta el reporte, pone
su score en 0, resuelve sus flags, y penaliza -15 la reputación de quien lo creó — todo en una sola
transacción de Prisma más una llamada aparte a `penalizeForFalseInformation`.

**Un punto se marca como cubierto (Fase 1):** alguien confirmado en la comunidad abre el detalle de
una necesidad → botón "Ya está cubierto" o el formulario genérico → `POST /:id/need-status` →
`needStatus` pasa a `cubierto` y `lastConfirmedAt` se refresca → el badge se pone verde en el
detalle (sin recargar), en las tarjetas y en el marcador del mapa → el reporte sale de "Necesidades
urgentes" en el home pero sigue visible (en verde) en el mapa y en "Todos los reportes" — así se
ve "no traer más" sin tener que abrir el reporte.

**Reportar desde un territorio fuera de las 6 zonas prioritarias:** usuario en `/reportar` sin que
su municipio aparezca en ningún chip de acceso rápido → modo "Buscar lugar" de `LocationSelector` →
elige cualquier departamento/municipio del catálogo (o "Escribir ubicación" si tampoco está en el
catálogo) → coloca el pin en el mapa embebido → `POST /api/reports` con `departmentName`/
`municipalityName` libres, sin ningún catálogo/enum del lado del backend que pueda rechazarlo → el
reporte queda igual de visible que uno de Cali, solo que fuera del rango de los chips de acceso
rápido del home (se encuentra filtrando por su departamento/municipio o navegando el mapa).

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
- **Confirmar tampoco pide cuenta desde hace poco — denunciar/actualizar/estado de necesidad sí
  siguen pidiéndola.** El corte no es "publicar vs. todo lo demás": confirmar es la acción de
  verificación más frecuente y de menor riesgo (solo suma un voto más, con el mismo límite de "una
  vez por tipo por reporte" que ya existía), así que se le aplicó el mismo criterio que a publicar
  — no perder a alguien real por pedirle una cuenta — reforzado con honeypot + rate limit propio +
  reCAPTCHA en vez de la barrera de auth. Denunciar/actualizar/marcar estado de necesidad son
  acciones con más impacto por intento (ocultar un reporte real, cambiar su estado visible) y
  siguen detrás de `requireAuth` a propósito.
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
- **`needStatus`/`quantityNeeded`/etc. viven en `Report` directamente** (Fase 1), no en una tabla
  1:1 aparte — mismo argumento que ya vale para `trustScore`: es un dato 1:1 real, todo listado ya
  carga el `Report` completo, y quedan `NULL` para las 3 categorías que no son `necesidad` (igual
  que `isSensitive`).
- **`quantityReceived` sigue siendo un total corriente, no un ledger de contribuciones — a propósito,
  incluso después de agregar `NeedCommitment`.** Modelar "quién trajo cuánto" por persona es
  exactamente lo que `NeedCommitment` (Fase A de "PROMPT MAESTRO v3", ver 4.2/6.9) agrega, pero
  vive **separado**: un compromiso nunca suma automáticamente a `quantityReceived`, porque prometer
  ayuda no es lo mismo que haberla entregado — mezclar ambos dejaría el número "Recibidos" mintiendo
  apenas alguien promete algo que todavía no llegó.
- **Actualizar un `NeedCommitment` es la única excepción de ownership en todo `reports.routes.ts`.**
  Confirmar/denunciar/actualizar/estado de necesidad siguen siendo comunitarios, nunca restringidos
  al creador del reporte — "reclamar un punto" (que un responsable se identifique y tenga permisos
  exclusivos *sobre el reporte*) sigue siendo una idea del documento maestro no implementada. Pero un
  compromiso de ayuda es una promesa *personal*, no una acción sobre el reporte de otro — por eso
  `PATCH /:id/commitments/:commitmentId` sí exige `userId === commitment.userId` (403 si no).
- **El catálogo territorial vive solo en el frontend, nunca en el backend.** `departmentName`/
  `municipalityName` son texto libre validado por largo, no por pertenencia a ningún catálogo — es
  la única forma de cumplir "nunca bloquear una publicación porque el lugar no esté en una lista
  predeterminada" de manera literal. La contrapartida es que el backend no puede normalizar ni
  agrupar por territorio de forma confiable (dos reportes de "Cali" y "cali " son técnicamente
  valores distintos) — aceptable para esta fase, un problema de normalización de texto, no de
  arquitectura, si hace falta resolverlo después.
- **`city` se eliminó de la migración en el mismo paso que se agregó su reemplazo**, no se dejó como
  columna muerta — el deploy de este proyecto es un solo servicio Render sin rolling/blue-green, así
  que no hay ventana real donde código viejo y schema nuevo convivan bajo tráfico. Ninguna migración
  previa del repo dejó columnas sin usar.
- **`findNearbyReports` usa un bounding-box de lat/lng antes del Haversine**, no un índice espacial
  real — aprovecha el `@@index([lat,lng])` que ya existía. Sin esto, quitar el filtro por ciudad
  (necesario para arreglar el bug de duplicados) hubiera dejado un `take` fijo sin `orderBy`
  corriendo sobre toda la tabla nacional, que podía devolver 0 resultados aunque sí hubiera
  reportes cercanos reales.
- **El mapa embebido de `LocationSelector` exige un pin en los 3 modos** (GPS/catálogo/manual), no
  solo en GPS — es la única forma de garantizar `lat`/`lng` reales sin depender de un dataset de
  centroides por municipio que no existe públicamente a ese nivel de detalle (~1,104 municipios).
- **Solo reportes `confirmed`/`institutional`/`covered`/`surplus` generan una pieza de compartir** —
  el nombre del documento fuente ("compartir reportes CONFIRMADOS") es literal. Un reporte recién
  publicado (`unconfirmed`) o disputado (`questioned`) solo comparte enlace + advertencia en texto,
  nunca una imagen pulida que invite a reenviarla sin cuestionarla.
- **`satori` en vez de SVG+`sharp` directo para la pieza de compartir.** Renderizar `<text>` crudo y
  rasterizarlo con `sharp`/librsvg en un contenedor headless es frágil (depende de qué fuentes tenga
  instaladas el sistema, y de soporte de emoji a color que Render no garantiza). `satori` vectoriza
  el texto usando las 2 fuentes TTF que le pasamos explícitamente — el resultado no depende del
  entorno. Por el mismo motivo, la pieza nunca usa glyphs Unicode (ni emoji ni símbolos como ✓/◆) —
  solo texto plano en español sobre píldoras de color.
- **`GET /:id/share-card` trata un reporte `status: "hidden"` como inexistente (404)**, a propósito
  distinto del resto de la app — `GET /api/reports/:id` general sí expone hoy un reporte oculto por
  moderación (hueco preexistente, no introducido por esta feature). Para la pieza de compartir sí se
  bloqueó explícitamente: no tiene sentido generar una imagen descargable de algo que un moderador
  ya retiró de circulación.
- **La URL corta de compartir es el UUID del reporte (`/r/:id`), no un código nuevo.** El UUID ya es
  público en `/reporte/:id` y en toda respuesta de la API — un código corto ganaría estética, no
  privacidad, y hubiera sido la "infraestructura nueva" que el documento fuente pide evitar por una
  ganancia cosmética.

## 11. Subagentes de Claude Code en este repo (`.claude/agents/`)

Se cargan solos al abrir el proyecto en Claude Code, listados también en el README:

- `backend-validator` — typecheck, tests, drift de Prisma/migraciones, build, cobertura de env vars.
- `frontend-validator` — typecheck, build, wiring de la API, rutas, CSP del mapa.
- `deploy-readiness` — secretos filtrados, CORS, config de storage, manejo de cookies cross-origin.
- `seo-specialist` — meta tags, Open Graph/Twitter cards, robots.txt, sitemap.xml. A diferencia de
  los tres anteriores (solo reportan), este puede aplicar los cambios directamente. Calibrado a que
  esta app es una SPA sin SSR (los bots de previsualización de WhatsApp/Telegram no ven contenido
  por ruta, solo el `<head>` estático) y a que el contenido de los reportes es comunitario y
  efímero (nunca debe llevar structured data que implique veracidad verificada).
