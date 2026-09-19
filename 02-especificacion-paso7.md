# Paso 7 — Especificación de implementación: flujo vertical mínimo

Este documento es una especificación de trabajo, no una explicación general.
Está escrito para que alguien que **no participó** en las decisiones
anteriores pueda implementar el paso 7 sin tener que adivinar nada ni
preguntar. Cada ticket indica archivo(s), lógica exacta, reglas de
autorización, y criterio de aceptación verificable con `curl`.

**Leer antes de empezar, en este orden:**
1. `docs/01-fundamentos-tecnicos.md` — decisiones de negocio ya cerradas
2. `db/schema.sql` — el modelo de datos, ya aplicado y probado
3. `api/openapi.yaml` — el contrato de cada endpoint
4. `backend/README.md` — cómo levantar el entorno local

El backend de los pasos 5 y 6 (esqueleto + auth/RBAC/auditoría) ya está
construido y **verificado con peticiones HTTP reales** — no hay que
tocar `auth/`, los guards globales, ni `AuditModule`. Este documento
cubre exclusivamente lo que falta: la lógica de negocio de viajes y
despacho.

---

## 0. Patrón geoespacial verificado — leer esto primero

Las columnas `geography` de PostGIS (`trips.origin`, `trips.destination`,
`driver_locations.position`, `service_zones.area`, etc.) **se manejan como
objetos GeoJSON, no como strings**, y esto ya está confirmado en runtime,
no es una suposición:

```typescript
// ESCRIBIR: se asigna el objeto directamente a la propiedad de la entidad
trip.origin = { type: 'Point', coordinates: [lng, lat] }; // OJO: [lng, lat], no [lat, lng]
await tripsRepository.save(trip);
// TypeORM lo envuelve automáticamente en ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)

// LEER: repository.find()/findOne() ya devuelve el objeto parseado
const found = await tripsRepository.findOne({ where: { id } });
found.origin; // => { type: 'Point', coordinates: [lng, lat] }
```

Las entidades ya están tipadas correctamente con `GeoPoint`/`GeoPolygon`
(`src/common/types/geo.types.ts`) — si se agrega una entidad nueva con
columna `geography`, usar ese mismo tipo, **no** `string`.

Para queries espaciales manuales (fuera del repository), usar
`dataSource.query()` con SQL crudo — ver los tickets de despacho más
abajo para ejemplos exactos con `ST_DWithin`, `ST_Contains`, `ST_Distance`.

---

## Ticket 7.0 — Seed adicional (prerrequisito de todos los demás)

El seed del paso 6 (`npm run seed`) crea roles y un usuario admin, pero
**no** crea zonas, tarifas, ni parámetros de configuración. Sin esto,
`POST /fares/quote` va a fallar siempre (no hay tarifa publicada) y el
despacho no tiene pesos ni radios definidos.

**Archivo:** ampliar `backend/src/database/seeds/seed.ts` (o crear
`seed-pilot-data.ts` aparte, ejecutado después del seed de RBAC).

**1. Agregar el permiso que falta** a la lista `PERMISSIONS` del seed
existente y otorgarlo a `OPERATOR` y `ADMIN`:
```typescript
'trips.review', // cotizar manualmente un viaje FORANEO (POST /trips/:id/review)
```

**2. Una zona de servicio** (ajustar el polígono real de cobertura —
este es un rectángulo de ejemplo alrededor de una ciudad, **hay que
reemplazarlo por el polígono real** antes de cualquier uso más allá de
pruebas locales):
```sql
INSERT INTO service_zones (organization_id, name, area, active)
SELECT id, 'Zona Centro', ST_GeomFromGeoJSON('{
  "type": "Polygon",
  "coordinates": [[
    [-98.78, 20.08], [-98.70, 20.08], [-98.70, 20.14], [-98.78, 20.14], [-98.78, 20.08]
  ]]
}')::geography, true
FROM organizations WHERE name = 'Piloto';
```

**3. Tarifas publicadas** para NORMAL y NOCTURNO, sin zona específica
(`zone_id = NULL` = tarifa por defecto de la categoría — ver sección 2.5
de `docs/01-fundamentos-tecnicos.md`). **Los montos son placeholders de
desarrollo — el negocio debe dar los valores reales antes del piloto
cerrado (paso 8).**
```sql
INSERT INTO fare_rules (organization_id, service_category, zone_id, name, version,
                         base_fare, cost_per_km, cost_per_minute, valid_from, status, created_by, published_by)
SELECT o.id, 'NORMAL', NULL, 'Normal v1', 1, 25.00, 8.00, 1.50, now(), 'PUBLISHED', u.id, u.id
FROM organizations o, users u WHERE u.email = 'admin@piloto.mx';

INSERT INTO fare_rules (organization_id, service_category, zone_id, name, version,
                         base_fare, cost_per_km, cost_per_minute, valid_from, status, created_by, published_by)
SELECT o.id, 'NOCTURNO', NULL, 'Nocturno v1', 1, 35.00, 10.00, 2.00, now(), 'PUBLISHED', u.id, u.id
FROM organizations o, users u WHERE u.email = 'admin@piloto.mx';
```

**4. Horario nocturno** (22:00–06:00, sin override manual activo):
```sql
INSERT INTO fare_schedules (organization_id, service_category, start_time, end_time, active)
SELECT id, 'NOCTURNO', '22:00', '06:00', true FROM organizations WHERE name = 'Piloto';
```

**5. Parámetros de configuración** (claves exactas que el código de los
tickets siguientes va a leer — **no cambiar los nombres de clave** sin
actualizar también el código que las lee):
```sql
INSERT INTO configuration (organization_id, key, value)
SELECT id, 'gps.interval_seconds', '5' FROM organizations WHERE name = 'Piloto';

INSERT INTO configuration (organization_id, key, value)
SELECT id, 'dispatch.weights', '{"proximity":0.40,"eta":0.25,"idle_time":0.20,"rating":0.10,"cancellations":0.05}'
FROM organizations WHERE name = 'Piloto';

INSERT INTO configuration (organization_id, key, value)
SELECT id, 'dispatch.max_radius_meters', '5000' FROM organizations WHERE name = 'Piloto';

INSERT INTO configuration (organization_id, key, value)
SELECT id, 'dispatch.max_eta_minutes', '15' FROM organizations WHERE name = 'Piloto';

INSERT INTO configuration (organization_id, key, value)
SELECT id, 'dispatch.idle_saturation_minutes', '30' FROM organizations WHERE name = 'Piloto';

INSERT INTO configuration (organization_id, key, value)
SELECT id, 'dispatch.offer_timeout_seconds', '20' FROM organizations WHERE name = 'Piloto';

-- Placeholder de desarrollo — el % real de comision lo define el negocio.
INSERT INTO configuration (organization_id, key, value)
SELECT id, 'commission.default_pct', '10.00' FROM organizations WHERE name = 'Piloto';
```

**Criterio de aceptación:** `SELECT * FROM fare_rules WHERE status='PUBLISHED'`
devuelve 2 filas; `SELECT * FROM configuration` devuelve 7 filas.

---

## Ticket 7.1 — `DistanceEstimationProvider` (estimador de distancia/tiempo)

**Por qué existe esto:** el stack ya decidido usa Google Distance Matrix
(Parte V, sección 2), pero eso requiere una API key que el piloto todavía
no tiene provisionada. Para no bloquear el resto del sistema en eso, se
define una interfaz con una implementación temporal (fórmula de
Haversine + factor de corrección), swappable sin tocar nada más el día
que haya API key.

**Archivo:** `src/modules/fares/distance-estimation.provider.ts`

```typescript
export interface DistanceEstimate {
  distanceKm: number;
  durationMin: number;
}

export const DISTANCE_ESTIMATION_PROVIDER = 'DISTANCE_ESTIMATION_PROVIDER';

export interface DistanceEstimationProvider {
  estimate(origin: GeoPoint, destination: GeoPoint): Promise<DistanceEstimate>;
}
```

**Archivo:** `src/modules/fares/haversine-distance.provider.ts`

Fórmula de Haversine exacta (radio de la Tierra = 6371 km):

```typescript
@Injectable()
export class HaversineDistanceProvider implements DistanceEstimationProvider {
  // Factor de correccion: una ruta real por calles es ~30-40% mas larga
  // que la linea recta. Placeholder hasta integrar Google Distance Matrix.
  private static readonly ROAD_FACTOR = 1.35;
  private static readonly AVERAGE_SPEED_KMH = 25; // velocidad urbana promedio con trafico

  async estimate(origin: GeoPoint, destination: GeoPoint): Promise<DistanceEstimate> {
    const R = 6371;
    const [lng1, lat1] = origin.coordinates;
    const [lng2, lat2] = destination.coordinates;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLineKm = R * c;

    const distanceKm = straightLineKm * HaversineDistanceProvider.ROAD_FACTOR;
    const durationMin = (distanceKm / HaversineDistanceProvider.AVERAGE_SPEED_KMH) * 60;

    return { distanceKm: Math.round(distanceKm * 100) / 100, durationMin: Math.round(durationMin) };
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
```

**Registro en `fares.module.ts`:**
```typescript
providers: [
  { provide: DISTANCE_ESTIMATION_PROVIDER, useClass: HaversineDistanceProvider },
],
exports: [DISTANCE_ESTIMATION_PROVIDER, /* ... */],
```

**Criterio de aceptación:** un test unitario con dos coordenadas conocidas
(ej. dos puntos a ~5km en línea recta) debe devolver `distanceKm` entre
6.5 y 7.0 (5km × 1.35) y `durationMin` coherente con 25 km/h.

---

## Ticket 7.2 — `FareCalculationService`

**Archivo:** `src/modules/fares/fare-calculation.service.ts`

### Método `determineServiceCategory(origin: GeoPoint, organizationId: string)`

```typescript
async determineServiceCategory(
  origin: GeoPoint,
  organizationId: string,
): Promise<{ category: ServiceCategory; zoneId: string | null }> {
  const zoneRows = await this.dataSource.query(
    `SELECT id FROM service_zones
     WHERE organization_id = $1 AND active = true
       AND ST_Contains(area::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326))
     LIMIT 1`,
    [organizationId, origin.coordinates[0], origin.coordinates[1]],
  );

  if (zoneRows.length === 0) {
    return { category: ServiceCategory.FORANEO, zoneId: null };
  }
  const zoneId = zoneRows[0].id;

  const schedules = await this.dataSource.query(
    `SELECT * FROM fare_schedules
     WHERE organization_id = $1 AND service_category = 'NOCTURNO' AND active = true`,
    [organizationId],
  );

  const isNocturno = this.evaluateNocturnoSchedules(schedules);
  return { category: isNocturno ? ServiceCategory.NOCTURNO : ServiceCategory.NORMAL, zoneId };
}
```

`evaluateNocturnoSchedules` — **atención al cruce de medianoche**
(22:00–06:00 significa "hora >= 22:00 O hora < 06:00", no un rango
directo):

```typescript
private evaluateNocturnoSchedules(schedules: FareScheduleRow[]): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const s of schedules) {
    if (s.manual_override === 'FORCE_ON') return true;
    if (s.manual_override === 'FORCE_OFF') return false;

    const [startH, startM] = s.start_time.split(':').map(Number);
    const [endH, endM] = s.end_time.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const withinWindow =
      startMinutes > endMinutes
        ? currentMinutes >= startMinutes || currentMinutes < endMinutes // cruza medianoche
        : currentMinutes >= startMinutes && currentMinutes < endMinutes;

    if (withinWindow) return true;
  }
  return false;
}
```

### Método `quote(origin, destination, organizationId)`

1. `category = determineServiceCategory(origin, organizationId)`
2. Si `category === FORANEO` → devolver
   `{ serviceCategory: 'FORANEO', estimatedFare: null, estimatedDistanceKm: null, estimatedDurationMin: null, fareRuleId: null, zoneId: null }`
   — **no** llamar al `DistanceEstimationProvider`, no tiene sentido para un viaje sin tarifa automática.
3. Si no: `distance = await distanceProvider.estimate(origin, destination)`
4. Buscar la tarifa aplicable — **la zona específica gana sobre la
   tarifa por defecto** (`NULLS LAST`):
```sql
SELECT * FROM fare_rules
WHERE organization_id = $1 AND service_category = $2 AND status = 'PUBLISHED'
  AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
  AND (zone_id = $3 OR zone_id IS NULL)
ORDER BY zone_id NULLS LAST
LIMIT 1
```
5. Si no hay fila → `throw new UnprocessableEntityException('No hay tarifa publicada para esta categoria y zona')`
6. `fare = fareRule.base_fare + fareRule.cost_per_km * distance.distanceKm + fareRule.cost_per_minute * distance.durationMin`
7. Devolver `{ serviceCategory: category, estimatedFare: round2(fare), estimatedDistanceKm: distance.distanceKm, estimatedDurationMin: distance.durationMin, fareRuleId: fareRule.id, zoneId }`

> **Regla que no debe romperse:** el paso 7.16 (completar viaje) SIEMPRE
> recalcula la tarifa final usando `trip.fare_rule_id` ya guardado —
> **nunca** vuelve a resolver la tarifa aplicable desde cero. Si se
> re-resolviera, una tarifa republicada a media tarde le cambiaría el
> precio a un viaje que ya estaba en curso.

**Criterio de aceptación:** con los datos del ticket 7.0 sembrados,
`quote()` con un origen dentro del polígono de la zona devuelve
`NORMAL` (o `NOCTURNO` si son las 23:00) con una tarifa > 0. Con un
origen fuera del polígono, devuelve `FORANEO` con `estimatedFare: null`.

---

## Ticket 7.3 — `POST /fares/quote`

Controlador delgado sobre `FareCalculationService.quote()`. DTO según
`api/openapi.yaml` (`FareQuoteRequest`/`FareQuoteResponse`). Requiere JWT
(sin `@Public()`), sin permiso especial — cualquier usuario autenticado
puede pedir una cotización.

---

## Ticket 7.4 — `POST /trips` (crear viaje)

**Archivo:** `src/modules/trips/trips.service.ts`, método `create()`.

**Regla de autorización que no está en el OpenAPI pero es obligatoria:**
> Si `@CurrentUser().role === 'PASSENGER'`, el `passengerId` del DTO se
> **ignora** — siempre se usa `@CurrentUser().id`. Un pasajero no puede
> crear viajes a nombre de otro. Solo `OPERATOR`/`ADMIN` (permiso
> `trips.manage`) pueden pasar un `passengerId` distinto al suyo, y ese
> caso debe generar una llamada explícita a `AuditService.record()`
> (`action: 'trip.create_on_behalf'`) además del registro automático del
> interceptor.

Lógica:
1. `quote = await fareCalculationService.quote(dto.origin, dto.destination, organizationId)`
2. Construir la entidad `Trip`:
   - `serviceCategory = quote.serviceCategory`
   - Si `FORANEO`: `status = PENDING_REVIEW`, `quotedFare = null`, `fareRuleId = null`
   - Si no: `status = QUOTED`, `quotedFare = quote.estimatedFare`, `fareRuleId = quote.fareRuleId`, `distanceKm = quote.estimatedDistanceKm`, `durationMin = quote.estimatedDurationMin` (esto son estimados; el paso 7.16 los sobreescribe con los reales al completar)
   - `securityCode = String(Math.floor(1000 + Math.random() * 9000))` (4 dígitos)
   - `origin`/`destination`: asignar directo como `GeoPoint` (ver sección 0)
3. `save(trip)`
4. Insertar `TripEvent`: `fromStatus: null, toStatus: trip.status, actorUser: currentUser, reason: 'trip_requested'`
5. **Si NO es FORANEO**, disparar el despacho automático **en la misma
   request** (a esta escala no hace falta cola de mensajes):
   `await dispatchService.startDispatch(trip.id)`
   — Si `startDispatch` no encuentra ningún candidato elegible, el viaje
   se queda en `QUOTED` (no en `SEARCHING_DRIVER`). Esto es una
   simplificación deliberada del piloto: no hay reintento automático en
   segundo plano todavía. El operador puede reintentar llamando de nuevo
   a `POST /trips/{id}/dispatch/start`, o asignar manualmente. Dejarlo
   documentado así evita que alguien "arregle" esto sin darse cuenta de
   que es una decisión, no un bug.
6. Devolver el trip actualizado (con `status` reflejando si el despacho
   automático avanzó a `SEARCHING_DRIVER` o no).

---

## Ticket 7.5 — `GET /trips`, `GET /trips/{tripId}`

**Regla de autorización obligatoria** (no explícita en el OpenAPI, pero
necesaria — sin esto cualquier pasajero autenticado podría ver viajes
ajenos):
- `role === 'PASSENGER'` → el filtro `passengerId` se fuerza siempre a
  `@CurrentUser().id`, sin importar qué mande el query param.
- `role === 'DRIVER'` → el filtro `driverId` se fuerza siempre a
  `@CurrentUser().id`.
- `role` en `('OPERATOR', 'ADMIN', 'FINANCE')` → puede consultar sin
  restricción (filtros del query tal cual vienen).

---

## Ticket 7.6 — `POST /trips/{tripId}/review` (cotización manual FORANEO)

Permiso requerido: `@RequirePermissions('trips.review')`.

1. `assertTransition(trip, [TripStatus.PENDING_REVIEW])` (ver Ticket 7.20)
2. `trip.quotedFare = dto.quotedFare; trip.quotedBy = currentUser.id; trip.status = QUOTED`
3. `save(trip)`
4. `TripEvent` insert (`PENDING_REVIEW → QUOTED`)
5. Llamada explícita (no solo el interceptor genérico) a:
   ```typescript
   auditService.record({
     actorUserId: currentUser.id,
     action: 'trip.foraneo_quoted',
     entity: 'trips',
     entityId: trip.id,
     oldValue: { quotedFare: null },
     newValue: { quotedFare: dto.quotedFare },
     reason: dto.notes ?? null,
   });
   ```
6. **No** dispara despacho automático — nunca, para FORANEO (ver
   `docs/01-fundamentos-tecnicos.md`, sección 2.5, punto 3). El siguiente
   paso es siempre que un operador llame a `POST /dispatch/manual-assign`.

---

## Ticket 7.7 — `DispatchService` (la pieza más compleja)

**Archivo:** `src/modules/dispatch/dispatch.service.ts`

### 7.7.a — Filtro de elegibilidad (SQL exacto)

```sql
SELECT
  dp.user_id AS driver_id,
  dva.vehicle_id AS vehicle_id,
  dp.average_rating,
  dp.available_since,
  ST_Distance(
    dl.position,
    ST_SetSRID(ST_MakePoint($originLng, $originLat), 4326)::geography
  ) AS distance_meters
FROM driver_profiles dp
JOIN driver_vehicle_assignments dva ON dva.driver_id = dp.user_id AND dva.active = true
JOIN vehicles v ON v.id = dva.vehicle_id
JOIN driver_locations dl ON dl.driver_id = dp.user_id
WHERE dp.status = 'AVAILABLE'
  AND v.status = 'ACTIVE'
  AND dl.recorded_at > now() - interval '2 minutes'
  AND ST_DWithin(
    dl.position,
    ST_SetSRID(ST_MakePoint($originLng, $originLat), 4326)::geography,
    $maxRadiusMeters
  )
  AND dp.user_id NOT IN (
    SELECT driver_id FROM trip_assignment_offers WHERE trip_id = $tripId
  )
```

Notas obligatorias:
- `dl.recorded_at > now() - interval '2 minutes'` descarta conductores
  con GPS obsoleto (celular apagado, app cerrada) — sin esto, un
  conductor "fantasma" podría llevarse un viaje.
- `dp.user_id NOT IN (...)` excluye candidatos que **ya** recibieron una
  oferta para este viaje (aceptada, rechazada o expirada) — evita
  reofertarle al mismo conductor que ya rechazó.
- No se filtra por `vehicle_type`: el piloto usa una sola categoría de
  vehículo (decisión ya tomada). Si se agrega más de una categoría en el
  futuro, agregar aquí `AND v.vehicle_type = $requiredType`.
- `$maxRadiusMeters` viene de `configuration` (`dispatch.max_radius_meters`).

### 7.7.b — Fórmula de score (pesos ya reconciliados, ver `docs/01-fundamentos-tecnicos.md` 2.1)

```
score = 0.40 × proximityScore
      + 0.25 × etaScore
      + 0.20 × idleScore
      + 0.10 × ratingScore
      − 0.05 × cancellationPenalty
```

Los pesos exactos vienen de `configuration.dispatch.weights` (JSON), no
hardcodeados — leerlos de ahí para poder recalibrarlos sin desplegar
código nuevo (ver `docs/01-fundamentos-tecnicos.md` 2.1: "recalibrarse
con datos reales del piloto").

Normalización de cada componente (rango 0–1, con `clamp(x, 0, 1)`):

```typescript
const proximityScore = clamp(1 - distanceMeters / maxRadiusMeters, 0, 1);

const etaMinutes = (distanceMeters / 1000 / AVERAGE_SPEED_KMH) * 60; // o via DistanceEstimationProvider
const etaScore = clamp(1 - etaMinutes / maxEtaMinutes, 0, 1);

const minutesSinceAvailable = availableSince
  ? (Date.now() - availableSince.getTime()) / 60000
  : 0;
const idleScore = clamp(minutesSinceAvailable / idleSaturationMinutes, 0, 1);

const ratingScore = clamp((averageRating - 1) / 4, 0, 1); // mapea 1..5 -> 0..1

// Cancelaciones del conductor en las ultimas 24h (query aparte sobre
// trip_assignment_offers con response='REJECTED' AND manual=false, o
// sobre trips.cancellation_reason con cancelled_by=DRIVER)
const cancellationPenalty = clamp(recentCancellations / 5, 0, 1);
```

`maxRadiusMeters`, `maxEtaMinutes`, `idleSaturationMinutes` también vienen
de `configuration` (ver claves exactas en el Ticket 7.0).

### 7.7.c — `startDispatch(tripId)`

1. Cargar el trip; `assertTransition(trip, [QUOTED, SEARCHING_DRIVER])`
   (permite reintentar si ya estaba en `SEARCHING_DRIVER` sin candidato).
2. Ejecutar 7.7.a, calcular score de cada candidato con 7.7.b, ordenar
   descendente.
3. Si no hay candidatos → dejar `trip.status = QUOTED`, devolver el trip
   tal cual (ver la nota del Ticket 7.4, paso 5).
4. Si hay candidatos → tomar el primero, `trip.status = SEARCHING_DRIVER`,
   crear `TripAssignmentOffer` (`driver`, `score`, `offeredAt: now()`,
   `manual: false`), guardar todo, `TripEvent` insert.

### 7.7.d — Expiración y reintento de ofertas (requiere `@nestjs/schedule`)

```bash
npm install --legacy-peer-deps @nestjs/schedule
```

**Archivo:** `src/modules/dispatch/dispatch-expiry.service.ts`

```typescript
@Injectable()
export class DispatchExpiryService {
  @Cron('*/5 * * * * *') // cada 5 segundos
  async expireStaleOffers() {
    const timeoutSeconds = await this.configService.get('dispatch.offer_timeout_seconds'); // default 20
    const staleOffers = await this.offers.find({
      where: {
        respondedAt: IsNull(),
        offeredAt: LessThan(new Date(Date.now() - timeoutSeconds * 1000)),
      },
      relations: ['trip'],
    });

    for (const offer of staleOffers) {
      offer.response = 'EXPIRED';
      offer.respondedAt = new Date();
      await this.offers.save(offer);
      // Reintenta con el siguiente candidato (7.7.a ya excluye a este)
      await this.dispatchService.startDispatch(offer.trip.id);
    }
  }
}
```

Registrar `ScheduleModule.forRoot()` en `app.module.ts` (junto a los
demás imports globales).

### 7.7.e — `respondToOffer(offerId, response, currentUser)`

- **Autorización obligatoria:** `offer.driver.userId === currentUser.id`,
  si no → `403 Forbidden`. Solo el conductor dueño de la oferta puede
  responderla.
- Si `ACCEPTED`:
  1. `offer.response = 'ACCEPTED'; offer.respondedAt = now()`
  2. `trip.driverId = offer.driverId; trip.vehicleId = <vehiculo activo de ese conductor>; trip.status = DRIVER_ASSIGNED`
  3. `driver.status = 'BUSY'`
  4. `TripEvent` insert
- Si `REJECTED`:
  1. `offer.response = 'REJECTED'; offer.respondedAt = now()`
  2. Reintentar: `await dispatchService.startDispatch(trip.id)` (7.7.a
     excluye automáticamente a este conductor por el `NOT IN`)

---

## Ticket 7.8 — `POST /trips/{tripId}/dispatch/start`

Wrapper delgado sobre `DispatchService.startDispatch()`. Permiso
`@RequirePermissions('trips.manage')` — reservado a staff, no a
pasajeros (el disparo automático desde `POST /trips` no pasa por este
guard porque es una llamada interna servicio-a-servicio, no HTTP).
`409` explícito si `trip.serviceCategory === 'FORANEO'` (ver OpenAPI).

## Ticket 7.9 — `GET /trips/{tripId}/dispatch/candidates`

Ejecuta 7.7.a + 7.7.b sin crear ninguna oferta — solo lectura, para que
el operador vea el ranking antes de decidir si interviene manualmente.

## Ticket 7.10 — `POST /dispatch/offers/{offerId}/respond`

Wrapper sobre 7.7.e. Sin permiso especial (cualquier conductor
autenticado puede responder **su propia** oferta — la autorización real
está dentro del servicio, no en el guard).

## Ticket 7.11 — `POST /dispatch/manual-assign`

Permiso `@RequirePermissions('dispatch.manual_assign')`.

1. `assertTransition(trip, [QUOTED, SEARCHING_DRIVER])`
2. Validar que el conductor (`dto.driverId`) tenga `status === 'AVAILABLE'`
   → si no, `409`.
3. Crear `TripAssignmentOffer` con `manual: true`, `assignedBy: currentUser.id`,
   `response: 'ACCEPTED'`, `offeredAt: now()`, `respondedAt: now()` (no
   requiere confirmación del conductor: el operador ya coordinó por
   fuera del sistema, típicamente radio o teléfono).
4. `trip.driverId`, `trip.vehicleId`, `trip.status = DRIVER_ASSIGNED`;
   `driver.status = 'BUSY'`.
5. Llamada explícita a `auditService.record()` con `reason: dto.reason`
   (el campo `reason` es obligatorio en el DTO — ver `api/openapi.yaml`).

---

## Ticket 7.12 — `PATCH /drivers/{driverId}/status`

- Solo el propio conductor (`driverId === currentUser.id`) o `ADMIN`.
- **Regla crítica para la equidad del score (7.7.b):** cuando el nuevo
  estado es `AVAILABLE` y el estado anterior no lo era, hacer
  `driver.availableSince = new Date()`. En cualquier otra transición,
  **no** tocar `availableSince`. Si esto se omite, el score de "justicia
  en la asignación" queda roto silenciosamente — no hay error visible,
  solo un despacho injusto que nadie va a notar hasta que un conductor
  se queje.

## Ticket 7.13 — `POST /drivers/{driverId}/locations`

- Solo el propio conductor (`driverId === currentUser.id`) → si no, `403`.
- `driver_locations`: upsert (`ON CONFLICT (driver_id) DO UPDATE`) —
  usar `repository.upsert()` de TypeORM o SQL directo.
- `driver_location_history`: siempre `INSERT` (nunca se actualiza ni se
  borra — es el histórico que el Ticket 7.16 usa para calcular la
  distancia real recorrida).
- Responder `204` sin cuerpo (ver `api/openapi.yaml`).

## Ticket 7.14 — `POST /trips/{tripId}/arrive`

- Solo `trip.driverId === currentUser.id`.
- `assertTransition(trip, [DRIVER_ASSIGNED, DRIVER_EN_ROUTE])`
- **Decisión de alcance explícita:** el piloto no detecta automáticamente
  "en camino" por proximidad GPS — el estado `DRIVER_EN_ROUTE` existe en
  el modelo para uso futuro, pero este endpoint transiciona directo de
  `DRIVER_ASSIGNED` a `DRIVER_ARRIVED`. No implementar detección de
  proximidad en este paso — es mejora futura (Should-have), no parte del
  piloto.
- `trip.status = DRIVER_ARRIVED`; `TripEvent` insert.

## Ticket 7.15 — `POST /trips/{tripId}/start`

- Solo `trip.driverId === currentUser.id`.
- `assertTransition(trip, [DRIVER_ARRIVED])`
- Validar `dto.securityCode === trip.securityCode` (comparación exacta de
  string) → si no coincide, `403 Forbidden` (no `401`: el usuario sí está
  autenticado, lo que falla es la autorización específica de esta acción).
- `trip.status = TRIP_IN_PROGRESS` (se salta `TRIP_STARTED` como valor
  guardado — ese estado del enum queda reservado sin usar por ahora, ver
  nota similar en el Ticket 7.14).
- `trip.startedAt = now()`; `TripEvent` insert.

## Ticket 7.16 — `POST /trips/{tripId}/complete` (el más delicado)

- Solo `trip.driverId === currentUser.id`.
- `assertTransition(trip, [TRIP_IN_PROGRESS])`

**Cálculo de distancia real** (a partir del histórico GPS entre el
inicio del viaje y ahora):

```sql
WITH pts AS (
  SELECT position::geometry AS geom, recorded_at
  FROM driver_location_history
  WHERE driver_id = $1 AND recorded_at BETWEEN $2 AND now()
  ORDER BY recorded_at
)
SELECT ST_Length(ST_MakeLine(geom ORDER BY recorded_at)::geography) AS meters,
       count(*) AS point_count
FROM pts
```

- Si `point_count < 2` (el conductor no mandó suficientes pings — celular
  sin señal, app cerrada): **fallback** a distancia en línea recta entre
  `trip.origin` y `trip.destination` vía `ST_Distance`, multiplicada por
  el mismo `ROAD_FACTOR = 1.35` del Ticket 7.1. Documentar en un log que
  se usó el fallback (no es un error, pero conviene poder auditarlo).
- `durationMin = (now() - trip.startedAt) / 60000` (tiempo real
  transcurrido, siempre disponible, no depende del GPS).

**Cálculo de tarifa final:**
- Si `trip.serviceCategory === 'FORANEO'`: `finalFare = trip.quotedFare`
  tal cual (la tarifa manual ya es definitiva, no se recalcula con
  distancia/tiempo reales).
- Si no: usar **siempre** `trip.fareRuleId` (nunca resolver la tarifa de
  nuevo):
  `finalFare = fareRule.base_fare + fareRule.cost_per_km × distanceKm + fareRule.cost_per_minute × durationMin`

**Actualizar:**
- `trip.distanceKm`, `trip.durationMin`, `trip.finalFare`,
  `trip.completedAt = now()`, `trip.status = PAYMENT_PENDING`
- `driver.status = 'AVAILABLE'`, `driver.availableSince = now()` (lo
  libera Y le resetea el reloj de justicia en la asignación — ver Ticket
  7.12)
- `TripEvent` insert

## Ticket 7.17 — `POST /trips/{tripId}/payment`

- Solo `trip.driverId === currentUser.id`.
- `assertTransition(trip, [PAYMENT_PENDING])`

**Tolerancia de monto:** si `abs(dto.amount - trip.finalFare) > 5` (pesos
MXN), **no** rechazar la petición — los conductores redondean efectivo.
En su lugar, llamar a `auditService.record()` con
`action: 'payment.amount_mismatch'` y los dos montos en
`oldValue`/`newValue`, para revisión posterior, y continuar el flujo
normalmente. Bloquear el pago por una discrepancia de unos pesos
generaría más fricción operativa de la que resuelve.

**Todo esto en una sola transacción** (`dataSource.transaction(...)`) —
son varias escrituras relacionadas y una falla a la mitad dejaría
registros financieros inconsistentes:

1. `INSERT` en `payments` (`method`, `amount: dto.amount`,
   `referenceNumber: dto.referenceNumber ?? null`,
   `confirmedBy: currentUser.id`, `status: 'DRIVER_CONFIRMED'`)
2. Leer `commission.default_pct` de `configuration` (placeholder `10.00`
   sembrado en el Ticket 7.0 — **el valor real de producción lo define
   el negocio, no el desarrollador**)
3. `INSERT` en `commissions`:
   `grossAmount = trip.finalFare`, `commissionPct`, `commissionAmount = grossAmount × commissionPct / 100`,
   `driverEarning = grossAmount − commissionAmount`
4. `trip.status = PAYMENT_CONFIRMED` → `TripEvent` insert → `trip.status = CLOSED` → `TripEvent` insert (dos transiciones, cada una con su fila en `trip_events`, aunque ocurran en el mismo request — no colapsar el rastro de auditoría por conveniencia)

## Ticket 7.18 — `POST /trips/{tripId}/cancel`

- `assertTransition(trip, [REQUESTED, PENDING_REVIEW, QUOTED, SEARCHING_DRIVER, DRIVER_ASSIGNED, DRIVER_EN_ROUTE, DRIVER_ARRIVED])`
  — **explícitamente prohibido** cancelar desde `TRIP_IN_PROGRESS` en
  adelante (`409`): un viaje ya iniciado no se cancela, se disputa
  (`DISPUTED`, fuera de alcance de este ticket).
- Si el trip tenía conductor asignado (`DRIVER_ASSIGNED` o posterior) y
  se cancela: `driver.status = 'AVAILABLE'`, `driver.availableSince = now()`
  (queda libre otra vez).
- `trip.status = CANCELLED_BY_{PASSENGER|DRIVER|SYSTEM}` según
  `dto.cancelledBy`; `trip.cancellationReason = dto.reason`;
  `TripEvent` insert.

## Ticket 7.19 — `POST /trips/{tripId}/rating`

- `assertTransition` no aplica igual aquí — se permite calificar desde
  `PAYMENT_CONFIRMED` o `CLOSED` únicamente.
- **`ratedUser` nunca lo manda el cliente** — se infiere en el servidor:
  si `currentUser.id === trip.passengerId` → `ratedUser = trip.driver.userId`;
  si `currentUser.id === trip.driver.userId` → `ratedUser = trip.passengerId`;
  cualquier otro caso → `403`.
- El `UNIQUE(trip_id, rated_by)` de la base es la garantía real de "una
  calificación por viaje" — capturar el error de Postgres
  (`code === '23505'`) y relanzarlo como `ConflictException` (`409`), no
  dejar que se propague como `500`.

---

## Ticket 7.20 — Utilidad transversal: `assertTransition`

Usar en **todos** los tickets anteriores que mutan `trip.status`, al
inicio del método, antes de cualquier otra escritura:

**Archivo:** `src/modules/trips/trip-state.util.ts`

```typescript
export function assertTransition(trip: Trip, allowedFrom: TripStatus[]): void {
  if (!allowedFrom.includes(trip.status)) {
    throw new ConflictException(
      `El viaje esta en estado ${trip.status}; se esperaba uno de: ${allowedFrom.join(', ')}`,
    );
  }
}
```

### Tabla de transiciones válidas (referencia única — no debe haber otra en el código)

| Estado actual | Endpoint | Estado siguiente |
|---|---|---|
| — | `POST /trips` (NORMAL/NOCTURNO) | `QUOTED` (o `SEARCHING_DRIVER` si el despacho automático encontró candidato) |
| — | `POST /trips` (FORANEO) | `PENDING_REVIEW` |
| `PENDING_REVIEW` | `POST /trips/{id}/review` | `QUOTED` |
| `QUOTED` / `SEARCHING_DRIVER` | `POST /trips/{id}/dispatch/start` | `SEARCHING_DRIVER` (o se queda igual si no hay candidatos) |
| `SEARCHING_DRIVER` | oferta `ACCEPTED` | `DRIVER_ASSIGNED` |
| `QUOTED` / `SEARCHING_DRIVER` | `POST /dispatch/manual-assign` | `DRIVER_ASSIGNED` |
| `DRIVER_ASSIGNED` / `DRIVER_EN_ROUTE` | `POST /trips/{id}/arrive` | `DRIVER_ARRIVED` |
| `DRIVER_ARRIVED` | `POST /trips/{id}/start` | `TRIP_IN_PROGRESS` |
| `TRIP_IN_PROGRESS` | `POST /trips/{id}/complete` | `PAYMENT_PENDING` |
| `PAYMENT_PENDING` | `POST /trips/{id}/payment` | `PAYMENT_CONFIRMED` → `CLOSED` |
| `REQUESTED` ... `DRIVER_ARRIVED` | `POST /trips/{id}/cancel` | `CANCELLED_BY_*` |

---

## Checklist de aceptación de todo el paso 7 (probar en este orden)

Igual que se hizo para el paso 6, cada paso debe probarse con `curl`
contra el backend corriendo de verdad, no solo revisarse en código.

```bash
# 0. Levantar servicios + seed (pasos 5/6) + seed del ticket 7.0
bash scripts/start-dev-services.sh
npm run seed
npm run seed:pilot-data   # o el nombre que se le de al script del Ticket 7.0
npm run start:dev

# 1. Login como admin, guardar token
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@piloto.mx","password":"Admin123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# 2. Cotizar un viaje NORMAL (coordenadas dentro del poligono del Ticket 7.0)
curl -s localhost:3000/fares/quote -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"origin":{"lat":20.10,"lng":-98.74},"destination":{"lat":20.12,"lng":-98.72}}'
# esperado: serviceCategory NORMAL (o NOCTURNO segun hora), estimatedFare > 0

# 3. Cotizar un viaje FORANEO (coordenadas fuera del poligono)
curl -s localhost:3000/fares/quote -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"origin":{"lat":19.40,"lng":-99.10},"destination":{"lat":19.42,"lng":-99.12}}'
# esperado: serviceCategory FORANEO, estimatedFare null

# 4. Crear un pasajero y un conductor de prueba (via seed o SQL directo),
#    loguearlos, y correr el flujo completo NORMAL:
#    crear viaje -> ver que paso a SEARCHING_DRIVER (necesita un conductor
#    AVAILABLE con posicion GPS reciente dentro del radio) -> el conductor
#    responde ACCEPTED -> arrive -> start (con el securityCode correcto) ->
#    complete -> payment -> rating

# 5. Repetir el flujo FORANEO:
#    crear viaje -> PENDING_REVIEW -> review (como operador) -> QUOTED ->
#    manual-assign (como operador) -> DRIVER_ASSIGNED -> resto igual

# 6. Confirmar en la base que trip_events tiene una fila por cada
#    transicion, sin huecos:
psql -d taxi_pilot_dev -c "SELECT to_status, occurred_at FROM trip_events WHERE trip_id = '<id>' ORDER BY occurred_at;"

# 7. Confirmar que commissions y driver_settlements reflejan la DEUDA del
#    conductor, no un pago (ver docs/01-fundamentos-tecnicos.md 2.4)
psql -d taxi_pilot_dev -c "SELECT gross_amount, commission_amount, driver_earning FROM commissions WHERE trip_id = '<id>';"
```

---

## Explícitamente fuera de alcance de este paso (no implementar aquí)

- **WebSockets / push en tiempo real**: el conductor se entera de una
  oferta haciendo *polling* (`GET /trips?driverId=me&status=SEARCHING_DRIVER`,
  o el endpoint equivalente que se decida) — no hay notificación push
  todavía. Es una mejora natural del paso 8 en adelante, no bloquea el
  piloto cerrado.
- **Integración real con Google Distance Matrix**: usar
  `HaversineDistanceProvider` (Ticket 7.1) hasta que haya API key
  provisionada; el diseño ya lo deja como una sola clase para reemplazar.
- **Detección de proximidad por GPS** para auto-transicionar
  `DRIVER_EN_ROUTE`/detectar llegada — los conductores marcan "llegué" y
  "empezar viaje" manualmente en la app (Tickets 7.14/7.15).
- **Reintento en segundo plano** cuando `startDispatch` no encuentra
  candidatos — por ahora requiere una llamada manual nueva (del
  pasajero, un refresh, o del operador).
