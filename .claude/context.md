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

**Módulo comunitario de mascotas (documento "PROMPT MAESTRO — MÓDULO COMUNITARIO DE MASCOTAS"):**
Fase 1/MVP ya implementada — ver sección 4.7/6.13. Reportar mascotas perdidas/encontradas/heridas o
que necesitan ayuda, integrado a esta misma app (no una app aparte), reusando la identidad guest,
`LocationSelector` y el motor de tarjetas de compartir ya existentes. **Sin mecanismo de contacto
directo todavía** — la reunificación depende de que la pieza compartida por WhatsApp circule y
llegue a la persona correcta, igual que hoy pasa de forma orgánica en los grupos; un mecanismo de
contacto y las confirmaciones comunitarias quedan para Fase 2, tal como el propio documento lo pide
(no implementar fases futuras antes de terminar el MVP).

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
    cardRenderer.ts        — primitivas genéricas de render satori→sharp (box, qrDataUri, renderCardPng), extraídas de share/ para reusar en pets/, ver 4.7
    guestIdentity.ts        — resolveGuestContact/syntheticEmailForPhone, extraídas de reports/ para reusar en pets/, ver 4.7
    recaptcha.ts            — verifyRecaptcha + requireRecaptchaForGuests (reCAPTCHA Enterprise), ver 4.2
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
    pets/             — mascotas perdidas/encontradas/heridas, moderación y compartir propios — ver sección 4.7
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

### 4.7 Mascotas (`modules/pets/`)

Fase 1/MVP del documento "PROMPT MAESTRO — MÓDULO COMUNITARIO DE MASCOTAS": reportar mascotas
perdidas, encontradas, heridas o que necesitan ayuda, con foto, ubicación, estado y compartir por
WhatsApp. **Deliberadamente no comparte código con `reports/`** más allá de dos extracciones a
`lib/` (`cardRenderer.ts`, `guestIdentity.ts`) — mismo criterio de "sin servicios genéricos
compartidos entre módulos" que ya rige el resto del backend (sección 3). **Sin `trustScore`
numérico de 0-100 ni decaimiento por tiempo** como el de `Report` — Fase 2 (sección 4.8) le agrega
un conteo simple de confirm/incorrect, deliberadamente más liviano que el algoritmo completo de
reportes.

**Modelo `PetReport`**: `reportType` (`lost`/`found`/`injured`/`needs_help`), `species`, `name?`,
`breed?`, `sex` (default `unknown`), `size?`, `primaryColor?`, `distinctiveFeatures?`,
`description`, `imageUrl?`, `status` (ciclo de vida, ver abajo), `helpCategory?`/`isEmergency?`
(solo relevantes si `reportType` es `needs_help`/`injured`, `NULL` en cualquier otro caso — mismo
patrón que `needStatus` en `Report`), ubicación (mismos campos que `Report`: `departmentName`/
`municipalityName`/`localityName?`/`locationSource`/`lat`/`lng`/`approxLocationText?`),
`happenedAt?` ("vista por última vez" o "encontrada el", opcional porque alguien angustiado puede
no recordar la hora exacta), `isSheltered` (bool), `hidden` (bool, moderación), `createdById`,
`lastConfirmedAt`.

**`status` (`PetStatus`) es puramente de ciclo de vida** (`lost`/`sighted`/`sheltered`/
`possible_match`/`found`/`reunited`/`needs_help`/`closed`/`outdated`) — a diferencia de
`Report.status`, que sí mezcla moderación (`hidden`) con vigencia (`active`/`inactive`), acá
**moderación vive en un campo `hidden` separado**: los valores de `PetStatus` ya están completamente
ocupados por significado de ciclo de vida, no queda ninguno libre para "oculto por moderación" sin
chocar con un estado real. `possible_match` existe en el enum desde ya aunque ningún código de Fase
1 lo asigne todavía — evita una migración nueva solo por un valor de enum cuando llegue Fase 2
(sugerencias automáticas de coincidencia).

**`createPetReport(actor, input, photoBuffer?)`** (`pets.service.ts`) — publicar tampoco pide cuenta
(mismo criterio que reportes/confirmar), resolviendo identidad guest vía `lib/guestIdentity.ts`.
`initialStatus(reportType, isSheltered)`: `lost` → `lost`; `found` + resguardada → `sheltered`;
`found` sin resguardar → `sighted`; `injured`/`needs_help` → `needs_help`. Si `isSheltered` (solo
tiene efecto cuando `reportType === "found"` — cualquier otro valor lo ignora sin importar qué haya
mandado el cliente), aplica `coarsenCoordinates()` (mismo helper que `isSensitive` en reportes) y
reemplaza `approxLocationText` por un texto genérico: **nunca se persiste la dirección exacta de una
vivienda privada** que está resguardando al animal. Si `reportType` es `needs_help`/`injured` y no
llegó `helpCategory`, 400 — ese guard vive en el service, no en el schema Zod (mismo motivo que
`needStatusSchema`: `validateBody` está tipado `AnyZodObject`, no acepta `.refine()`).

**`POST /api/pets` es multipart, no JSON** — única excepción a la convención del resto del backend
(donde subir una foto es siempre una llamada aparte, ej. `POST /reports/:id/evidence`): la foto
viaja en el **mismo request** que el resto de los campos, porque el documento fuente pide un flujo
de "menos de 60 segundos" con la foto como parte central, no un segundo paso que alguien angustiado
podría no completar. Como multer puebla `req.body` con strings para *todo*, incluidos números y
booleanos, `pets.schemas.ts` no puede usar `z.coerce.number()`/`z.coerce.boolean()` directo:
- `requiredNumericString(min, max)` = `z.string().trim().min(1).pipe(z.coerce.number().gte(min).lte(max))`
  — `z.coerce.number()` solo() fallaría silencioso: `Number("")` es `0` en JS, así que un `lat`/`lng`
  vacío pasaría como `0,0` en vez de fallar la validación.
- `booleanString` = `z.string().optional().transform((v) => v === "true")` — no `z.coerce.boolean()`:
  `Boolean("false")` es `true`, cualquier string no vacío coacciona a verdadero. Mismo patrón que ya
  usa `listQuerySchema.institutional` en `reports.schemas.ts`.

Orden de middleware en `pets.routes.ts`: `createPetReportLimiter → uploadPetPhoto (multer) →
validateBody(createPetReportSchema) → requireRecaptchaForGuests → handler` — multer puebla
`req.body` antes de llamar a `next()`, así que `validateBody` corriendo después sí ve esos campos.

**`updatePetStatus(id, userId, {status, note?})`** — `requireAuth`, **comunitario, no restringido al
creador** (mismo criterio que `updateNeedStatus` en reportes: no se construyó una máquina nueva de
verificación de dueño para una mascota que pudo haber creado un invitado sin sesión, que no tiene
forma de demostrar después que es "suya"). A diferencia de `updateNeedStatus` (que además deja una
línea en el timeline público del reporte), acá no existe timeline todavía — así que cada cambio
escribe una entrada en el `AuditLog` genérico ya existente (`action: "pet.status_update"`, `metadata:
{from, to, note}`, mismo mecanismo que ya usan `moderateReport`/`createReport`, cero modelo/UI
nuevos, ya se ve en `/api/admin/audit-logs` y en `AdminPage.tsx`): "reunida" es la métrica norte del
documento (la señal de que el sistema funcionó), así que un cambio malicioso sin ningún remedio/rastro
visible es más grave acá que el caso análogo en reportes — el fix no cambia quién puede hacer el
cambio, solo asegura que un moderador pueda verlo y revertirlo.

**Moderación** (`petModeration.routes.ts`, montado en `/api/admin/pets`, `requireAuth +
requireRole("moderator","admin")`): `GET /` (todas, incluye `hidden`), `PATCH /:id` con
`action: "hide"|"unhide"|"delete"` — **sin** `markFalse`/`resolve`, esos son conceptos del
`trustScore` que mascotas no tiene en Fase 1. `delete` es soft (`deletedAt`), igual que reportes.

**Compartir por WhatsApp** (`petShareCard.service.ts`, reusa `lib/cardRenderer.ts`) —
`determinePetShareStatus(pet)` clasifica en `lost`/`found`/`reunited`/`needs_help` (`reunited` gana
siempre que `status === "reunited"`, sin importar el `reportType` original). **A diferencia de
reportes, los 4 estados siempre generan imagen** — no hay eje de confianza que filtrar ("nunca
glamorizar lo no confirmado" no aplica porque no hay noción de "no confirmado" para mascotas en Fase
1. Copy en español por estado, incluido el cierre automático "🐾 YA VOLVIÓ A CASA" cuando el estado
pasa a `reunited`. Puerta social propia en `/r/mascota/:id` (`petShareGateway.routes.ts`, montada
**antes** de `/r/:id` de reportes en `app.ts` — el orden no importa estructuralmente, ya que
`/mascota` es un segundo segmento que `/r/:id` de Express nunca matchea, pero se dejó así por
claridad). `PetShareEvent` es un modelo propio, no una generalización de `ShareEvent` (que ya tiene
una FK dura a `Report` con `onDelete: Cascade` — retocarlo a polimórfico tocaría una tabla que ya
funciona por una ganancia mínima a esta escala).

**Fase 1 se publicó deliberadamente sin mecanismo de contacto directo** (confirmado con el usuario
durante la planeación) — la reunificación dependía solo de que la pieza compartida por WhatsApp
circulara y llegara a la persona correcta. Fase 2 (sección 4.8) agrega justamente eso: revelar
contacto y confirmaciones comunitarias.

### 4.8 Mascotas — Fase 2: confirmaciones, avistamientos, posible coincidencia, revelar contacto

Un subagente Plan validó este diseño línea por línea contra el código ya fusionado de Fase 1 antes
de implementarlo (mismo criterio que el propio Fase 1) y corrigió varios puntos concretos, todos ya
incorporados abajo.

**`PetConfirmation`** — reusa `ConfirmationType` (el mismo enum que `ReportConfirmation`: `confirm`/
`unsure`/`incorrect`) en vez de un enum nuevo casi duplicado, aunque la UI de mascotas nunca ofrezca
"unsure". `confirmPet(petId, actor, type)` es el mismo patrón exacto que `confirmReport`: sin
`actor.userId`, exige nombre + (correo o celular), resuelve guest vía `resolveGuestContact`, 409 si
se repite `(petReportId, userId, type)`. Si `type === "confirm"`, actualiza `lastConfirmedAt` y
llama `rewardUsefulConfirmation` — decisión explícita: sí se reusa para mascotas, porque
`UserReputation` es un score de *usuario* (buen comportamiento comunitario), no de *reporte*, así
que confirmar una mascota es la misma señal que confirmar un reporte. `GET /api/pets/:id` (solo el
detalle, nunca el listado — evitaría un N+1 sobre hasta 100 filas) gana `confirmationsCount`/
`incorrectCount` vía dos `prisma.petConfirmation.count()` dirigidos.

**`PetSighting`** ("LA VI AQUÍ") — `userId` **nunca null**: igual que `PetConfirmation`, un
avistamiento sin sesión resuelve una identidad guest, a diferencia de `PetShareEvent` (telemetría
pura que sí acepta anónimo real sin ninguna identidad). Nunca expone quién lo reportó — mismo
criterio que `needCommitments`, que anonimiza a "un colaborador" en vez de un nombre real; no hay
precedente en todo el schema de denormalizar un `displayName` snapshot, así que tampoco se agregó
acá.

**`findPossibleMatches(pet, {sameType})`** — bounding-box + Haversine sobre `lat`/`lng`, mismo
cálculo que `findNearbyReports` en `reports.service.ts`. Filtra por `species` igual, `hidden: false`,
`deletedAt: null`, `id: { not: pet.id }`, ventana de fecha de 30 días sobre
`happenedAt ?? createdAt` en ambos lados, tope `take: 500` (mismo que `findNearbyReports`).
Clasifica cada mascota en "lado perdida" (`status: lost`) o "lado encontrada" (`sighted`/
`sheltered`/`found`) — **independiente de `reportType`** (una `found` resguardada sigue del lado
"encontrada"); `needs_help`/`reunited`/`possible_match`/`closed`/`outdated` no participan del
emparejamiento. `sameType: false` busca el lado opuesto (esto — Fase 2, "posibles coincidencias"
lost↔found); `sameType: true` busca el mismo lado (Fase 4, sección 4.10, detección de duplicados) —
**la misma función alimenta las dos fases**, calculada al leer, nunca persistida ni en un cron.
`GET /api/pets/:id/possible-matches` es público.

**Revelar contacto** (`POST /api/pets/:id/reveal-contact`) — decisión de producto explícita
(consultada con el usuario): mostrar el correo/celular real de quien reportó, con una advertencia,
en vez de construir un sistema de mensajería interno completo. Quien lo pide —con o sin sesión—
debe traer su propio nombre + contacto, mismo patrón anti-scrape que confirmar. Dos riesgos reales
que el propio diseño ya corrige:
- **Nunca filtra el correo sintético de un invitado que solo dio celular** — si
  `creator.email === syntheticEmailForPhone(creator.phone)`, se omite `email` de la respuesta
  (si no, se mostraría `tel-XXXX@guest.aquiayudamosve.local` como si fuera un correo real, violando
  el invariante documentado en `lib/guestIdentity.ts`).
- **`revealContactLimiter` (5/hora por IP) nunca se salta con sesión activa** — a diferencia de
  `guestActionLimiter` (que sí se salta a sí mismo si hay `req.user`, porque `confirmationLimiter` ya
  cubre ese caso), acá cualquier cuenta autenticada podría rasparse contactos igual de rápido que un
  invitado si se copiara ese mismo patrón — así que este limiter aplica siempre, sin excepción.

Escribe `AuditLog` (`pet.contact_revealed`, `metadata: {revealedToUserId}`) — **nunca** re-guarda el
correo/celular revelado en el log: ese dato ya vive en `User`, duplicarlo en un `Json` de auditoría
(visible a cualquier moderador vía `/api/admin/audit-logs`) sería una segunda copia sin protección
de algo ya sensible.

`possible_match` (existía en el enum desde Fase 1, sin ningún código que lo asignara) ahora es
seleccionable en el selector de estado del frontend.

### 4.9 Mascotas — Fase 3: directorio "quiero ayudar con mascotas"

**`PetResource`** — veterinarios, transporte, hogares temporales, puntos de atención, rescate.
**`requireAuth` para crear**: ofrecer un servicio compromete tu identidad, a diferencia de reportar
una mascota (que sigue siendo anónimo-friendly). Sin `lat`/`lng` — es cobertura de
departamento/municipio (catálogo), no un pin exacto; no aplica el mismo criterio de
`LocationSelector` que exige un pin en los 3 modos. Moderación (`hidden`/`deletedAt`) espeja
`PetReport` — **no `Organization`**, que hoy es un archivo plano de 2 endpoints solo-admin sin
`hidden`, sin filtros y sin moderación; el precedente real de estructura es
`pets.service.ts`/`pets.schemas.ts`/`pets.routes.ts`/`petModeration.routes.ts`, con el mismo split
en 4 archivos (`petResources.schemas.ts`, `petResources.service.ts`, `petResources.routes.ts`,
`petResourceModeration.routes.ts`).

`PetResourceCategory` es un enum **distinto** de `PetHelpCategory` aunque los valores mayormente se
reflejen — uno describe demanda (qué necesita una mascota), el otro oferta (qué ofrece alguien);
`shelter` (demanda) mapea a `temporary_home` (oferta), `food`/`water` (demanda, sin equivalente
directo) caen a `attention_point`. "Contacto de correo o celular" vive en el service, no en el
schema Zod — mismo motivo que `NEEDS_ANY_HELP` en `pets.service.ts`: `validateBody` está tipado
`AnyZodObject`, no acepta `.refine()`. Toda creación deja `AuditLog` (`pet_resource.create`) — mismo
criterio que `pet.create`/`report.create`, omitirlo sería el mismo tipo de hueco que el "AuditLog
remedy gap" de Fase 1.

`app.ts` monta `/api/pets/resources` **antes** de `/api/pets` a propósito: Express prueba los
`app.use()` en orden de registro, y `/api/pets` ya matchea cualquier ruta que empiece por ese
prefijo — sin este orden, `GET /api/pets/resources` caería dentro de `pets.routes.ts`'s `GET /:id`
(tratando `"resources"` como un id) antes de llegar nunca al router correcto. Mismo tipo de fix que
`/r/mascota` antes de `/r` en Fase 1.

### 4.10 Mascotas — Fase 4: alertas de cercanía + fusión de duplicados

**Sin migración nueva** — ambas piezas reusan mecanismos que ya existen. Dos decisiones de alcance
se resolvieron con el usuario antes de implementar (`AskUserQuestion`, no se repiten después):
alertas de cercanía reusan `broadcastPush()` tal cual (broadcast a todas las suscripciones, sin
segmentación por usuario/ubicación — `PushSubscription` no tiene `userId` ni lo va a tener en esta
fase), y revelar contacto (Fase 2) usa revelado directo, no mensajería.

**Alertas de cercanía**: dado que `createPetReport` ya dispara un push en cada creación desde Fase
1, la única pieza nueva es: después de crear, llamar `findPossibleMatches(pet, {sameType: false})`
y, si hay al menos un match, un **segundo** push (fire-and-forget, nunca esperado, nunca más de uno
por creación sin importar cuántos matches haya) con copy distinto ("Podría haber una coincidencia
cerca"). Bajo la opción elegida (sin segmentación), esto es intencionalmente modesto — se documenta
así explícitamente, no es una omisión.

**`GET /api/admin/pets/duplicates`** (`findDuplicatePets()`) — bajo demanda, nunca en cada carga del
panel de admin (escanear pares es más caro que un listado normal): para cada mascota activa con
`status` en `lost`/`sighted`/`sheltered`/`found` (tope 200, ordenadas por `createdAt desc`), corre
`findPossibleMatches(pet, {sameType: true})`, dedup de pares `(a,b)`≡`(b,a)`. Nota: qué mascota cae
en `pair.a` vs `pair.b` depende del orden de iteración (`createdAt desc`), no de cuál se creó
"primero" en términos humanos — el frontend solo necesita mostrar el par, no asumir un orden
semántico.

**`PATCH /api/admin/pets/:id/merge`** (`mergePetReports`) — body `{intoId, reason}`. Valida que
ambas existan y compartan `species` (guard contra fusionar mascotas no relacionadas por error).
Soft-delete del `id` de la URL (`deletedAt`), `intoId` sobrevive; un `AuditLog`
(`pet.moderation.merge`, `metadata: {mergedIntoId, reason}`). **Deliberadamente sin** un campo
`mergedIntoId` persistido en `PetReport` para redirigir un enlace viejo — no existe ningún flujo de
"deshacer" para `delete` en todo el backend, ni en reportes ni en mascotas, así que un enlace
guardado a un reporte fusionado da 404 igual que cualquier otro soft-delete hoy; agregar un puntero
de redirect solo para mascotas hubiera sido inconsistente con ese precedente, no más simple.

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
`share_events` (tabla nueva `ShareEvent`, sin backfill, ver "Compartir por WhatsApp" en 4.6) →
`pet_reports` (tablas nuevas `PetReport`/`PetShareEvent` + 6 enums, sin backfill, ver 4.7) →
`pet_report_hidden_flag` (columna `hidden` en `PetReport`, agregada como segunda migración chica
después de notar, ya implementando el service, que `PetStatus` no tenía ningún valor libre para
moderación — más seguro que editar la migración anterior ya aplicada, que hubiera generado drift en
el checksum que Prisma guarda por migración) →
`pet_confirmations_sightings` (tablas nuevas `PetConfirmation`/`PetSighting`, sin backfill, ver 4.8) →
`pet_resources` (tabla nueva `PetResource` + enum `PetResourceCategory`, sin backfill, ver 4.9).
Fase 4 (sección 4.10) no agregó ninguna migración — reusa columnas/tablas ya existentes.

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
| `PetReport` | Mascota perdida/encontrada/herida/necesita ayuda — ver 4.7 |
| `PetShareEvent` | Telemetría best-effort de compartir un `PetReport`, propio (no reusa `ShareEvent`) — ver 4.7 |
| `PetConfirmation` | confirm/incorrect sobre una mascota, único por (mascota, usuario, tipo) — ver 4.8 |
| `PetSighting` | "LA VI AQUÍ" — avistamiento con ubicación opcional, autor nunca expuesto — ver 4.8 |
| `PetResource` | Recurso del directorio "quiero ayudar con mascotas" — ver 4.9 |

`ReputationLevel` (enum): `nuevo` → `colaborador` → `colaborador_confiable` →
`voluntario_verificado` → `organizacion` → `entidad_institucional`.
`CategoryGroup` (enum): `ayuda` / `necesidad` / `critico` / `info`.
`LocationSource` (enum): `gps` / `catalog` / `manual` — cómo se obtuvo el pin de un `Report`.
`NeedStatus` (enum, Fase 1): `necesitamos` / `en_camino` / `parcialmente_cubierto` / `cubierto` /
`excedente` / `desactualizado` — solo se usa en `Report` cuando `category.group === "necesidad"`.
`CommitmentStatus` (enum, Fase A de "PROMPT MAESTRO v3"): `committed` / `on_the_way` / `delivered` /
`cancelled` — estado de un `NeedCommitment`, ver 4.2.
`ShareChannel` (enum): `whatsapp` / `web_share` / `copy_link` / `save_image` — canal de un
`ShareEvent`, ver 4.6 (reusado también por `PetShareEvent`, ver 4.7).

Enums de mascotas (ver 4.7): `PetReportType` (`lost`/`found`/`injured`/`needs_help`), `PetSpecies`
(`dog`/`cat`/`bird`/`rabbit`/`horse`/`other`), `PetSex` (`male`/`female`/`unknown`), `PetSize`
(`small`/`medium`/`large`), `PetStatus` (`lost`/`sighted`/`sheltered`/`possible_match`/`found`/
`reunited`/`needs_help`/`closed`/`outdated`), `PetHelpCategory` (`veterinary`/`food`/`water`/
`transport`/`shelter`/`rescue`/`other`). `PetConfirmation.type` reusa `ConfirmationType` (arriba,
mismo enum que `ReportConfirmation`), no uno propio (ver 4.8). `PetResourceCategory` (ver 4.9):
`veterinary`/`transport`/`temporary_home`/`attention_point`/`rescue`/`other` — enum aparte de
`PetHelpCategory` aunque los valores se reflejen mayormente (demanda vs. oferta).

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
    PetCard.tsx                — tarjeta de mascota en listados, ver 6.13
    PetStatusBadge.tsx          — pill de PetStatus, ver 6.13
    PetMapLayer.tsx             — mapa Leaflet propio para /mascotas (no generaliza MapView.tsx), ver 6.13
    PetShareSheet.tsx           — casi duplicado de ShareSheet.tsx apuntando a los endpoints de mascotas, ver 6.13
    petStatusStyle.ts           — PET_STATUS_META + labels de species/reportType/helpCategory/resourceCategory + HELP_TO_RESOURCE_CATEGORY — a diferencia de needStatusStyle.ts, acá el texto SÍ vive en el frontend (el backend nunca calculó labels para mascotas), ver 6.13/6.15
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
| `/reporte/:id` | `ReportDetailPage` | lectura pública; confirmar es público (ver 6.11); denunciar/actualizar/evidencia/estado de necesidad requieren login (redirige a `/login`) |
| `/login`, `/registro` | `LoginPage`, `RegisterPage` | público |
| `/perfil` | `ProfilePage` | requiere sesión |
| `/admin` | `AdminPage` | requiere rol `moderator`/`admin` — incluye moderación de mascotas, ver 6.13 |
| `/privacidad` | `PrivacyPolicyPage` | público — Habeas Data, ver 6.12 |
| `/mascotas` | `PetsPage` | público (con o sin cuenta) — ver 6.13 |
| `/mascotas/reportar` | `PetReportPage` | público (con o sin cuenta) — ver 6.13 |
| `/mascotas/ayudar` | `PetResourcesPage` | público — directorio de recursos, ver 6.15 |
| `/mascotas/ayudar/nuevo` | `PetResourceFormPage` | requiere sesión — ver 6.15 |
| `/mascotas/:id` | `PetDetailPage` | lectura pública; confirmar/avistar/revelar contacto son públicos (ver 6.14), cambiar estado requiere sesión — ver 6.13 |

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

### 6.12 Habeas Data / política de tratamiento de datos personales

`PrivacyPolicyPage.tsx` (ruta `/privacidad`, enlazada desde `Footer.tsx` en toda la app) — página
en español orientada a la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia (Habeas Data): qué
datos se recolectan (nombre/correo/celular, ubicación, fotos de evidencia) y para qué, con quién se
comparten (nunca con fines comerciales — solo los proveedores técnicos que hacen funcionar la
plataforma), los 5 derechos del titular que exige la ley (conocer/actualizar/rectificar; solicitar
prueba de autorización; ser informado; revocar autorización y/o solicitar supresión; acceder
gratis), y cómo ejercerlos (`jostele17@gmail.com` / `jdorozco13@gmail.com` — el primero también es
el `VAPID_CONTACT` por defecto). Escrita en lenguaje
llano, sin inventar una razón social/NIT que no existe — se describe honestamente como iniciativa
comunitaria sin fines de lucro (mismo texto que ya usa `Footer.tsx`), no una empresa.

**Aviso, no checkbox bloqueante.** `GuestContactFields.tsx` (cubre `ReportFormPage.tsx`,
`NeedHelpPage.tsx` y `GuestConfirmModal.tsx` de una sola vez, ver 6.11) y `RegisterPage.tsx` tienen
un texto corto con link a `/privacidad` junto al campo de datos/botón de enviar — a propósito no es
una casilla de aceptación obligatoria que bloquee el formulario: esta app lleva toda la sesión
quitando barreras de fricción para publicar/confirmar en una emergencia, y agregar un checkbox
bloqueante justo ahí reintroduciría el mismo tipo de fricción. Informa la finalidad del tratamiento
igual (que es la obligación central de Habeas Data) sin bloquear el flujo.

### 6.13 Mascotas (frontend)

**`PetsPage.tsx`** (`/mascotas`) — 3 acciones principales (PERDÍ MI MASCOTA / ENCONTRÉ UNA MASCOTA /
NECESITA AYUDA — Fase 1 las publicó **sin** "QUIERO AYUDAR" a propósito; Fase 3 lo reintrodujo como
un botón secundario debajo, ver 6.15), filtros de departamento/municipio (mismo patrón que
`HomePage`) + chips por `reportType`, lista de `PetCard`, y un mapa propio (`PetMapLayer`, ver
abajo) — mascotas **no** se mete en los filtros del mapa principal de reportes, tiene el suyo, más
chico.

**`PetReportPage.tsx`** (`/mascotas/reportar?type=lost|found|needs_help`) — una sola página con
secciones reveladas progresivamente (mismo patrón que `ReportFormPage.tsx`, no un wizard separado
por rutas). El toggle de 3 vías se precarga desde el query param pero se puede cambiar después de
aterrizar (igual que el toggle de grupo en `ReportFormPage`). Si `reportType === "found"`, aparece
el toggle "¿La tienes contigo ahora?" (`isSheltered`) — la distinción "la vi" vs. "la tengo
resguardada" que pide el documento, con aviso de que la dirección exacta no se muestra si está
resguardada. Si es `needs_help`/`injured`, aparece el select de `helpCategory` (obligatorio) +
checkbox de urgencia. Reusa `LocationSelector` y `GuestContactFields` (trae el aviso de Habeas Data
gratis, ver 6.12) tal cual. **La foto va en el mismo `FormData` que el resto de los campos** (ver
4.7) — `api.createPetReport()` arma el `FormData` a mano (números → string, booleanos →
`"true"`/`"false"` explícito, nunca omitidos — `booleanString` en el backend lee el string literal)
y pasa por el `request()` compartido de `api/client.ts`, **nunca un `fetch` crudo** como
`submitEvidence` en `ReportDetailPage.tsx` — ese patrón nunca manda el header `Authorization` (solo
la cookie, que `authenticate` en el backend nunca lee), así que un usuario con sesión que reportara
una mascota por ese camino perdería su atribución silenciosamente y terminaría como invitado igual
— bug real que este componente evita desde el diseño, no una precaución hipotética.

**`PetDetailPage.tsx`** (`/mascotas/:id`) — detalle + `PetStatusBadge` + banner de celebración fijo
cuando `status === "reunited"` ("🎉 ¡Nombre ya volvió a casa!") + botón COMPARTIR (`PetShareSheet`)
+ control de cambio de estado. El control de estado se oculta detrás de `!profile` (muestra "Inicia
sesión para actualizar el estado" en su lugar) — a diferencia de confirmar reportes (6.11, que se
abrió del todo), cambiar el estado de una mascota **sigue** pidiendo cuenta, mismo criterio que
`updateNeedStatus` de reportes (6.7): es una acción con más impacto por intento que un simple voto.
Fase 2 (6.14) agrega confirmar/avistar/revelar contacto/posibles coincidencias a esta misma página —
el select de estados ya incluye `possible_match`, que Fase 1 excluía a propósito por no tener aún
ningún flujo que lo produjera.

**`PetMapLayer.tsx`** — copia del setup de Leaflet ya probado en `MapView.tsx` (`CircleMarker`,
nunca `Marker` — mismo bug de íconos rotos con Vite) en vez de generalizar ese componente, que está
tipado específicamente a `Report[]`.

**`PetShareSheet.tsx`** — casi duplicado de `ShareSheet.tsx` apuntando a `api.getPetShareCard`/
`api.recordPetShareEvent` en vez de los de reportes — el propio documento sugiere este componente
separado. A diferencia del original, nunca debería mostrar el estado "solo enlace, sin imagen" en
la práctica (los 4 estados de mascota siempre generan imagen, ver 4.7), pero el fallback se deja
igual por si la subida a almacenamiento falla.

**Integración con el resto de la app**: `Navbar.tsx` gana un `NavLink` a `/mascotas` dentro del
fragmento `rest` ya compartido entre desktop y menú hamburguesa (aparece en ambos sin JSX nuevo para
mobile). `HomePage.tsx` gana una sección propia "🐾 Mascotas" (no una 5ª tarjeta en el grid de
"Situación actual", que ya es `grid-cols-4` completo) con conteo en vivo
(`api.getPetReports({pageSize: 1}).total`) y link a `/mascotas`. `AdminPage.tsx` gana una sección
apilada con su propia tabla (`PetsTable`, no una generalización de `ReportsTable`, que está tipada a
`Report[]` con columnas específicas como `TrustBadge`) — solo hide/unhide/delete, sin
markFalse/resolve (conceptos de `trustScore` que mascotas no tiene).

### 6.14 Mascotas — Fase 2 (frontend)

`PetDetailPage.tsx` es la primera vez que el módulo de mascotas se conecta a `GuestContactContext`/
`GuestConfirmModal` (Fase 1 nunca los usaba). Todas las acciones nuevas de esta fase —confirmar,
marcar incorrecto, avistar, revelar contacto— comparten un único despachador: un tipo `PendingAction`
(`{kind: "confirm", type} | {kind: "sighting", lat?, lng?, note?} | {kind: "reveal"}`) +
`runGuestGated(action)` (si no hay `profile` ni `guestContact` ya recordado, guarda la acción
pendiente y abre el modal; si ya hay uno de los dos, corre directo) + `performAction(action, contact?,
honeypot?)` (arma el `guest` payload con `getRecaptchaToken` solo si hay `contact`, y hace el fetch
correspondiente según `action.kind`). Mismo patrón que `confirmAsGuestOrUser` en
`ReportDetailPage.tsx`, generalizado a 3 acciones en vez de 1.

- **Confirmar/marcar incorrecto** — botones "✓ CONFIRMAR"/"REPORTAR INCORRECTO", mismo estilo que
  reportes. `pet.confirmationsCount`/`incorrectCount` (`?: number` en el tipo `PetReport` — solo
  presentes cuando el pet vino de `GET /api/pets/:id`, nunca del listado, ver 4.8) se muestran junto
  a "Última actualización".
- **"LA VI AQUÍ"** — solo se ofrece cuando `pet.reportType === "lost"` (un avistamiento no tiene
  sentido narrativo para una mascota ya encontrada). Botón "📍 Usar mi ubicación"
  (`navigator.geolocation`, mismo patrón que `LocationSelector`/`HomePage`) + una nota de texto —
  **sin** el `LocationSelector` completo de 3 modos, que es demasiado para un avistamiento rápido.
  Timeline debajo, anonimizado (nunca se pide ni se muestra quién lo reportó).
- **Posibles coincidencias** — panel que solo aparece si `getPossibleMatches` devuelve algo (nunca un
  estado vacío visible), mini-tarjetas con distancia en km, enlazan al candidato.
- **Revelar contacto** — botón "VER CONTACTO" abre una advertencia explícita primero
  (`revealWarningOpen`, "vas a ver el nombre y correo o celular... úsalo con respeto") con un botón
  de confirmación separado ("Sí, mostrar contacto") antes de llamar a la API — nunca revela de
  inmediato al primer clic.

`api/client.ts` gana `confirmPet`, `createPetSighting`, `getPetSightings`, `getPossibleMatches`,
`revealPetContact`. `types.ts` gana `PetSighting`, `PossibleMatch` (`PetReport` + `distanceMeters`),
`RevealedPetContact` (`email`/`phone` opcionales — puede faltar el correo si el creador es un guest
que solo dio celular, ver 4.8).

### 6.15 Mascotas — Fase 3 (frontend)

`PetsPage.tsx` reintroduce "🤝 QUIERO AYUDAR" como botón secundario (no un 4º botón del mismo peso
que los 3 de reportar — es una acción conceptualmente distinta) → navega a `/mascotas/ayudar`.

**`PetResourcesPage.tsx`** (`/mascotas/ayudar`) — directorio público filtrable por
categoría/departamento/municipio (mismo patrón de filtros que `PetsPage`). CTA "+ Ofrecer ayuda" si
hay `profile`, o "Inicia sesión para ofrecer ayuda" si no (mismo patrón que el control de estado en
`PetDetailPage.tsx`, no una redirección forzada).

**`PetResourceFormPage.tsx`** (`/mascotas/ayudar/nuevo`) — si `!profile`, muestra un mensaje +
botón "Inicia sesión" en vez del formulario (guard a nivel de componente, no solo de ruta). Categoría
por botones tipo chip (igual que `PetReportPage.tsx`'s selector de especie), `contactName` precargado
de `profile.displayName` (editable — `Profile` no expone email, así que igual hay que escribirlo a
mano).

`PetDetailPage.tsx` gana una sección "Recursos que podrían ayudar" para mascotas `needs_help`/
`injured`: un `useEffect` separado (no puede ir en el `load()` inicial — depende de
`pet.helpCategory`, que no se conoce hasta que el pet mismo cargó) llama
`getPetResources({category: HELP_TO_RESOURCE_CATEGORY[pet.helpCategory], departmentName})`. Sin
scoring, primeros 6 resultados.

`AdminPage.tsx` gana `PetResourcesTable` (mismo patrón que `PetsTable`: hide/unhide/delete, sin
markFalse/resolve).

### 6.16 Mascotas — Fase 4 (frontend)

`AdminPage.tsx` gana una sección "Posibles duplicados" — **cargada bajo demanda** vía un botón
("Buscar posibles duplicados"), nunca en el `load()` inicial del panel (escanear pares es más caro
que un listado normal, ver 4.10). Cada par ofrece dos botones, "Fusionar A → B" y "Fusionar B → A"
— quien modera elige cuál sobrevive; no hay un default "correcto" porque cuál de los dos es
`pair.a`/`pair.b` depende del orden de iteración del backend (`createdAt desc`), no de cuál se
reportó "primero" en un sentido humano.

`api/client.ts` gana `getPetDuplicates()` y `mergePets(id, intoId, reason)`.

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

**Reportar y reunificar una mascota:** usuario en `/mascotas` sin sesión → PERDÍ MI MASCOTA →
`/mascotas/reportar?type=lost` con foto + ubicación + nombre/correo → `POST /api/pets` (multipart,
sin `Authorization`) → `resolveGuestContact` crea/reutiliza un `User` guest (mismo mecanismo que
reportes) → `status: "lost"` → si ya existe una mascota `found` cerca de la misma especie, un
segundo push avisa "podría haber una coincidencia" (Fase 4, 4.10) → aparece en `/mascotas` y en su
mapa → cualquiera con cuenta comparte por WhatsApp (`PetShareSheet`, genera pieza + texto) → alguien
la reconoce, por el push, por la pieza compartida, o navegando el panel "Posibles coincidencias" del
detalle (Fase 2, 4.8) → pide ver el contacto de quien reportó (advertencia explícita antes de
mostrarlo) y coordinan por fuera de la plataforma → una persona con cuenta entra al detalle y cambia
el estado a `reunited` (comunitario, no solo el creador) → banner de cierre "🎉 ya volvió a casa" +
el cambio queda en `AuditLog` para moderación si hiciera falta revertirlo.

**Confirmar, avistar y detectar duplicados (Fase 2/4):** cualquier visitante del detalle de una
mascota puede confirmar/marcar incorrecto (mismo criterio sin cuenta que reportes) o reportar un
avistamiento ("LA VI AQUÍ") con o sin ubicación — ambos resuelven una identidad guest la primera vez
y la recuerdan el resto de la visita (`GuestContactContext`). Un moderador en `/admin` carga bajo
demanda "Posibles duplicados" (mismo motor de emparejamiento que "posibles coincidencias", pero
comparando mascotas del mismo lado del ciclo de vida en vez de lados opuestos) y fusiona dos reportes
de la misma mascota — el que se fusiona queda con `deletedAt`, 404 público, y la fusión queda en
`AuditLog` (`pet.moderation.merge`).

**Ofrecer ayuda con mascotas (Fase 3):** una persona con cuenta va a `/mascotas/ayudar` → "+ Ofrecer
ayuda" → registra un `PetResource` (veterinaria, transporte, hogar temporal, punto de atención o
rescate) con contacto y cobertura territorial → aparece en el directorio público y, si su categoría
coincide con el `helpCategory` de una mascota `needs_help`/`injured` en el mismo departamento, en la
sección "Recursos que podrían ayudar" del detalle de esa mascota.

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
- **Mascotas no comparte tablas/servicios con reportes, solo dos extracciones a `lib/`.** Se evaluó
  generalizar `ShareEvent`/`ShareCard` a polimórfico y se descartó — tocaría código de reportes que
  ya funciona por una ganancia mínima a esta escala (dos módulos, no veinte). Lo único que sí se
  extrajo (`cardRenderer.ts`, `guestIdentity.ts`) era código genérico de verdad, sin ninguna
  referencia a `Report` en su lógica.
- **`PetReport.hidden` es un campo separado de `PetReport.status`, a diferencia de `Report.status`**
  (que sí mezcla moderación con vigencia). Se descubrió a mitad de implementación que los 9 valores
  de `PetStatus` ya estaban completamente ocupados por significado de ciclo de vida — no había forma
  de meter "oculto" ahí sin chocar con un estado real, así que se agregó una columna nueva vía una
  segunda migración chica en vez de reabrir la primera ya aplicada.
- **Cambiar el estado de una mascota escribe en `AuditLog`, aunque sigue siendo comunitario/abierto
  (no restringido al creador).** Es la única diferencia real de este endpoint respecto a su análogo
  de reportes (`updateNeedStatus`, que ni siquiera necesita esto porque ya deja rastro en el
  timeline público) — se agregó porque "reunida" es la métrica norte del documento (la señal de que
  el sistema cumplió su propósito), así que un cambio malicioso sin ningún remedio visible se juzgó
  más grave acá que el caso análogo en reportes. No cambia quién puede hacer el cambio.
- **`POST /api/pets` es multipart con la foto en el mismo request — el único endpoint de escritura
  de todo el backend con esta forma.** Cada otro endpoint que sube un archivo lo hace como llamada
  aparte (`POST /reports/:id/evidence`). Se decidió así porque el documento fuente pide
  explícitamente un flujo de "menos de 60 segundos" con la foto como parte central, no un segundo
  paso opcional que alguien angustiado buscando a su mascota podría no completar nunca.
- **Los 4 estados de mascota (`lost`/`found`/`reunited`/`needs_help`) siempre generan pieza de
  compartir, a diferencia de reportes** (donde solo 4 de 6 estados de confianza la generan). No es
  una inconsistencia — mascotas no tiene ningún eje de confianza en Fase 1, así que no hay nada
  análogo a "no glamorizar lo no confirmado" que filtrar. La contrapartida práctica: en un entorno
  sin credenciales reales de `STORAGE_*` (como este dev local), literalmente cualquier llamada a
  `GET /pets/:id/share-card` intenta subir a almacenamiento y falla — a diferencia de reportes, que
  sí tiene un camino (`unconfirmed`) que nunca toca almacenamiento y por eso es testeable sin
  credenciales reales. `PetShareSheet.tsx`/`getPublicPetPreview()` degradan con gracia igual (ver
  4.7/6.13), solo que el caso "con imagen real" no se puede verificar end-to-end sin credenciales de
  Supabase Storage reales — verificado a mano con un script suelto (mismo criterio que 4.6) en vez
  de vía HTTP.
- **Fase 1 se publicó sin mecanismo de contacto directo entre quien reporta y quien encuentra una
  mascota** — confirmado explícitamente con el usuario durante la planeación, no una omisión. La
  reunificación dependía de que la pieza compartida por WhatsApp circulara y llegara a la persona
  correcta. Fase 2 agregó justo eso (revelar contacto, 4.8) una vez confirmado que el flujo base ya
  funcionaba.
- **Revelar contacto directo (Fase 2) en vez de mensajería interna** — decisión de alcance explícita,
  consultada con el usuario antes de implementar: mostrar el correo/celular real de quien reportó,
  con una advertencia, reutiliza el dato que ya se captura al reportar y no requiere construir un
  sistema de mensajería (hilos, bandeja de entrada, notificar cada mensaje nuevo). El costo es que sí
  expone un dato de contacto real a un desconocido — mitigado con la advertencia explícita antes de
  revelar y el rate limiter dedicado que nunca se salta con sesión activa.
- **Alertas de cercanía (Fase 4) reusan `broadcastPush()` sin segmentación, otra decisión de alcance
  consultada explícitamente** — la alternativa (agregar `userId` opcional a `PushSubscription` para
  poder avisarle específicamente al creador de un reporte que hace match) hubiera cumplido más
  literalmente "alerta de cercanía", pero es un cambio de esquema + una superficie de prueba mucho
  mayor para una fase que el documento mismo trata como exploratoria. Bajo la opción elegida, la
  única pieza nueva de verdad es un segundo push al crear si ya hay un posible match — Fase 1 ya
  cubría el push base de "mascota nueva".
- **`findPossibleMatches` alimenta tanto "posibles coincidencias" (Fase 2, lados opuestos) como
  "posibles duplicados" (Fase 4, mismo lado) — una sola función, un solo parámetro (`sameType`).**
  No se escribieron dos motores de emparejamiento separados aunque sirven a audiencias y decisiones
  distintas (cualquier visitante vs. solo moderadores) — el cálculo geoespacial+temporal+especie es
  idéntico, solo cambia qué "lado" del ciclo de vida se compara contra cuál.
- **`PetConfirmation`/`PetSighting` reusan `ConfirmationType` (el enum de `ReportConfirmation`) y
  exigen `userId` no-nulo, respectivamente, en vez de inventar variantes propias** — un subagente
  Plan encontró ambos casos durante la validación del diseño: un segundo enum con 2 de 3 valores
  hubiera sido duplicación pura, y todo el resto del schema resuelve una identidad guest real para
  cualquier acción no puramente-telemetría (la única excepción genuina es `PetShareEvent`/
  `ShareEvent`, que sí es telemetría pura).
- **El directorio de recursos (Fase 3) espeja la estructura de `pets.service.ts` (schemas/service/
  routes/moderación en 4 archivos), no la de `Organization`** — aunque ambos son "alguien ofrece
  algo", `Organization` hoy es un archivo plano de 2 endpoints solo-admin, sin `hidden`, sin filtros
  y sin moderación; copiar esa forma hubiera dejado el directorio de recursos con menos estructura de
  la que realmente necesita (listado público filtrable + moderación hide/unhide/delete).
- **Fusión de duplicados (Fase 4) no agrega un puntero `mergedIntoId` para redirigir un enlace
  viejo** — se evaluó y se descartó explícitamente: no existe ningún flujo de "deshacer" para
  `delete` en todo el backend, ni en reportes ni en mascotas, así que un enlace guardado a un reporte
  ya fusionado da 404 igual que cualquier otro soft-delete hoy. Agregar el puntero solo para mascotas
  hubiera sido una excepción a ese precedente, no una simplificación.

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
