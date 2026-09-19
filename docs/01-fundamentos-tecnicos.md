# Fundamentos Técnicos del Piloto

Este documento congela las decisiones de los pasos 1 y 2 del plan de ejecución.
A partir de aquí, cualquier cambio de alcance o de estas reglas debe registrarse
aquí explícitamente — no debe decidirse "sobre la marcha" dentro del código.

---

## PASO 1 — Alcance congelado (piloto de 50 a 100 unidades)

### Módulos incluidos en esta primera construcción (Must-have)

| Código | Módulo | Alcance en el piloto |
|---|---|---|
| AUTH | Autenticación y sesiones | Login, tokens, roles |
| RBAC | Roles y permisos | Permisos atómicos por acción |
| PAS | Pasajeros | Perfil, solicitud, historial |
| DRV | Conductores | Perfil, documentos, estado, turno |
| VEH | Vehículos | Alta, documentos, estado |
| TRP | Viajes | Ciclo de vida completo, incluida la revisión manual para viajes foráneos |
| DSP | Despacho | Filtro de elegibilidad + score simple, asignación manual |
| GPS | Geolocalización | Posición actual + histórico básico |
| FAR | Tarifas | Versionado por categoría (normal/nocturno/foráneo) y zona/colonia |
| PAY | Pagos | Confirmación de cobro: efectivo y terminal bancaria del conductor (pasarela digital dentro de la app queda reservada para una fase posterior) |
| FIN | Finanzas | Comisiones como deuda del conductor hacia la empresa, liquidación periódica, conciliación |
| NTF | Notificaciones | Eventos principales del viaje |
| AUD | Auditoría | Transversal a todos los módulos |

### Explícitamente fuera de esta primera construcción

No se elimina del documento maestro — se difiere a una fase posterior, cuando la
operación real (no solo la definición) lo justifique:

- Billetera digital del conductor y bonos automáticos.
- Inteligencia artificial predictiva y Data Warehouse histórico.
- Grabación de viajes.
- Antifraude avanzado (se conserva únicamente la regla de "ubicación imposible").
- Geocercas con acciones automáticas (zonas simples sí; geocercas activas no).
- Administración multi-sucursal activa (la tabla existe en el esquema para no
  romper la arquitectura después, pero no se construye la interfaz de gestión).
- Infraestructura multi-región, Kubernetes, o cualquier diseño pensado para
  miles de unidades.

---

## PASO 2 — Decisiones de reconciliación técnica

### 2.1 Motor de despacho

Se separa en dos fases, tal como ya lo anticipaban los requerimientos
DSP-002 (Filtros de elegibilidad) y DSP-003 (Puntuación) de la Parte II:

**Fase A — Filtro de elegibilidad (binario, no ponderado).**
Un conductor solo entra como candidato si:
- está `AVAILABLE`;
- su vehículo no está `BLOCKED` ni en `MAINTENANCE`;
- el tipo de vehículo es compatible con el tipo de servicio solicitado;
- está dentro de una zona de cobertura activa.

**Fase B — Score ponderado (solo entre candidatos elegibles).**

| Variable | Peso inicial | Fuente del dato |
|---|---|---|
| Proximidad | 40% | Google Distance Matrix |
| Tiempo estimado de llegada (ETA) | 25% | Google Distance Matrix (ya incorpora tráfico) |
| Tiempo disponible sin servicio ("justicia", sección 25 Parte I) | 20% | `driver_profiles.available_since` |
| Calificación promedio | 10% | `driver_profiles.average_rating` |
| Cancelaciones recientes (penalización) | 5% | conteo de los últimos N viajes |

Se elimina "nivel de combustible" del score inicial: no existe fuente de datos
confiable en un piloto sin telemetría OBD instalada. El tráfico no se pondera
aparte porque ya está implícito en el ETA de Google Distance Matrix.

**Estos pesos son un punto de partida, no una verdad definitiva.** Se
almacenan en la tabla `configuration` (clave `dispatch.weights`) y deben
recalibrarse con datos reales del piloto, comparando el score automático
contra las decisiones que tome el operador cuando intervenga manualmente.

### 2.2 Intervalo de GPS

Valor por defecto: **5 segundos**. Se almacena como parámetro configurable en
la tabla `configuration` (clave `gps.interval_seconds`), nunca como constante
en el código de la app del conductor, para poder ajustarlo sin publicar una
nueva versión de la aplicación.

### 2.3 Vocabulario único de estados

El panel de flotilla mostrará colores, pero el color siempre se **calcula**
a partir de los tres estados reales — nunca se guarda como un campo propio,
para no crear una cuarta fuente de verdad (principio de la sección 9, Parte I):

| Color mostrado | Estado real que representa |
|---|---|
| 🟢 Disponible | `driver.status = AVAILABLE` |
| 🔵 En camino | `trip.status IN (DRIVER_EN_ROUTE, TRIP_IN_PROGRESS)` y `driver.status = BUSY` |
| 🟡 Esperando | `trip.status = DRIVER_ARRIVED` |
| 🟠 Pausado | `driver.status = PAUSED` |
| 🔴 Fuera de servicio | `vehicle.status = OUT_OF_SERVICE` o `driver.status = OFFLINE` |

### 2.4 Modelo de pagos y comisiones: efectivo y terminal bancaria

Los conductores operan mayormente en efectivo, pero deben poder aceptar pagos
con terminal bancaria física propia (tipo Clip, terminal de un banco, etc.).
Esto obliga a invertir el flujo de comisión respecto a un modelo tipo
plataforma-cobra-y-paga.

**Métodos de pago del piloto:**
- `CASH` — efectivo.
- `CARD_TERMINAL` — terminal física del conductor, **no integrada por API**
  con la plataforma; es un dispositivo aparte que el conductor ya trae.
- `DIGITAL_INAPP` — pago dentro de la app vía pasarela (Stripe / Mercado
  Pago / OpenPay). Se reserva el campo en el esquema para no bloquear esta
  opción a futuro, pero **queda fuera de alcance del piloto** (Won't have).

**Consecuencia clave: en `CASH` y `CARD_TERMINAL` el dinero nunca pasa por
la plataforma.**
El conductor cobra directo al pasajero y se queda con el 100% al momento del
viaje. Lo que cambia es que ahora **le debe a la empresa el porcentaje de
comisión de ese viaje** — es una deuda que se acumula y se liquida
periódicamente, en vez de un pago que la empresa le hace al conductor.
Esto es exactamente lo que ya anticipaba conceptualmente la sección 48 del
documento base ("Conciliación"), solo que ahora es el flujo principal, no
una excepción.

**Cómo queda representado en el modelo de datos** (ver `db/schema.sql`):
- `payments.method` acepta `CASH`, `CARD_TERMINAL` o `DIGITAL_INAPP`, con un
  `reference_number` opcional para el folio de la terminal (solo para
  auditoría — no hay conciliación automática posible sin integración API).
- Para `CASH` y `CARD_TERMINAL` el pago se confirma manualmente por el
  conductor dentro de la app (monto + método); no existe confirmación
  automática de una pasarela, así que `payment_transactions` solo se usa
  para el camino `DIGITAL_INAPP` futuro.
- `commissions` sigue generándose por viaje, pero ahora representa lo que
  el conductor **le debe** a la empresa, no un pago que recibe.
- `driver_settlements` acumula esa deuda por periodo (por ejemplo semanal).
- Se agrega `settlement_payments`: el registro auditable de cuándo y cómo el
  conductor efectivamente liquida esa deuda (depósito de efectivo,
  transferencia, descuento de una fianza), siguiendo la regla de oro de la
  sección 117 (quién, cuánto, cuándo, cómo).

### 2.5 Categorías de servicio y tarifas por zona

El piloto maneja **tres categorías de servicio**, cada una con su propio
tarifario y potencialmente distinto por colonia:

- **NORMAL** — servicio local en horario diurno.
- **NOCTURNO** — mismo tipo de servicio, pero con tarifario propio (no un
  porcentaje sobre NORMAL), activo en un horario configurable.
- **FORANEO** — viaje fuera de las zonas de cobertura habituales. No se
  cotiza ni se despacha en automático.

**Se deja abierto, tal como se pidió, en tres frentes:**

1. **Cuotas por colonia.** `fare_rules` combina `service_category` +
   `zone_id`, así que cada colonia puede tener su propia tarifa por
   categoría, o usar la tarifa por defecto de esa categoría si no tiene
   una fila específica cargada. No hay que tocar el esquema para agregar
   colonias — solo cargar filas nuevas en `fare_rules`.
2. **Activación del horario nocturno.** `fare_schedules` define una
   ventana `start_time`–`end_time` para NOCTURNO, pero también permite
   forzar manualmente el estado (`manual_override`) desde el centro de
   monitoreo — por ejemplo, activar nocturno antes de tiempo un día de
   evento especial, sin depender solo del reloj.
3. **Foráneo se manda a consulta.** Un viaje FORANEO entra con estado
   `PENDING_REVIEW` en vez de cotizarse solo. Un operador del centro de
   monitoreo revisa la solicitud, fija la tarifa manualmente
   (`trips.quoted_by` registra quién la autorizó) **y asigna manualmente
   al conductor** — para FORANEO el despacho automático nunca se dispara,
   ni para cotizar ni para asignar. Es el mismo mecanismo de asignación
   manual que ya existe para casos de excepción en NORMAL/NOCTURNO
   (`trip_assignment_offers.manual` + `assigned_by`), solo que aquí es
   la única vía, no una excepción.

---

## Paso 5 — Esqueleto del backend (cerrado y verificado)

Backend NestJS en `backend/`, organizado en 13 módulos de dominio que
corresponden 1:1 a los módulos del alcance congelado (Paso 1). Cada tabla
de `db/schema.sql` tiene su entidad TypeORM en el módulo correspondiente.

**Verificado en un entorno real durante su construcción**, no solo
compilado: PostgreSQL 16 + PostGIS 3.4 instalados, esquema completo
aplicado sin errores, Redis corriendo, y la aplicación arrancó y
respondió correctamente en `/health`:

```json
{"status":"ok","database":"connected","postgis":"3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"}
```

Decisiones de este paso:
- **TypeORM con `synchronize: false`** — `db/schema.sql` sigue siendo la
  única fuente de verdad del esquema; TypeORM nunca lo modifica por su
  cuenta.
- **Columnas geoespaciales reales** (`type: 'geography'`) en origen/destino
  de viajes, zonas de servicio y posiciones de conductor — no simuladas
  como texto.
- **Cuatro archivos de entorno** (`development`, `test`, `staging`,
  `production`), con `staging`/`production` como plantillas: sus valores
  reales deben venir de un gestor de secretos, nunca de un archivo
  commiteado.
- **Validación de entorno estricta**: la app no arranca si falta una
  variable crítica — falla en el arranque, no en producción a medianoche
  con un despacho activo.

Ver `backend/README.md` para instrucciones de arranque.

---

## Paso 6 — Núcleo transversal: auth, RBAC y auditoría (cerrado y verificado)

Implementado sobre el esqueleto del paso 5:

- **AUTH**: `POST /auth/login` (email o teléfono + contraseña) devuelve un
  JWT de 8h. El payload incluye `role` y `permissions` ya resueltos, para
  no consultar la base en cada request.
- **RBAC**: `JwtAuthGuard` global — toda ruta exige JWT válido salvo que
  esté marcada `@Public()`. `PermissionsGuard` global — una ruta puede
  exigir un permiso puntual con `@RequirePermissions('codigo')`; sin ese
  decorador, alcanza con estar autenticado.
- **Auditoría**: `AuditService.record()` para que cualquier módulo registre
  un cambio de negocio con su `old_value`/`new_value` real (regla de oro,
  sección 117). Además, `AuditInterceptor` registra automáticamente toda
  escritura HTTP (POST/PATCH/PUT/DELETE) como red de seguridad de línea
  base, aunque un desarrollador olvide llamar al servicio explícitamente.
- **Seed** (`npm run seed`): crea la organización del piloto, el catálogo
  de permisos, los cinco roles base (ADMIN, OPERATOR, FINANCE, DRIVER,
  PASSENGER) y un usuario ADMIN de prueba.

**Verificado con peticiones HTTP reales contra Postgres+Redis corriendo**,
no solo revisado en código:

| Prueba | Resultado |
|---|---|
| Ruta protegida sin token | `401` |
| Login con contraseña correcta | `200` + JWT válido |
| Login con contraseña incorrecta | `401` (mismo mensaje que "no existe" — no revela cuál falló) |
| Ruta protegida con token válido, sin permiso requerido | `200` |
| Rol **con** el permiso exigido (`ADMIN` → `users.manage`) | `200` |
| Rol **sin** el permiso exigido (`DRIVER` → `users.manage`) | `403` |
| Auditoría automática del `POST /auth/login` | fila real en `audit_logs`, con el body saneado (sin exponer la contraseña) |

## Paso 7 — Flujo vertical mínimo (cerrado y verificado)

Implementado siguiendo `docs/02-especificacion-paso7.md` ticket por
ticket, con el mismo estándar de los pasos anteriores: **probado con
peticiones HTTP reales contra Postgres+PostGIS+Redis corriendo, no solo
compilado.**

### Flujo NORMAL/NOCTURNO — probado de extremo a extremo

`POST /fares/quote` → `POST /trips` (auto-cotiza y auto-despacha) →
`GET /dispatch/offers/pending` (conductor) → `POST /dispatch/offers/{id}/respond`
(ACEPTADA) → `arrive` → `start` (con código de seguridad real) →
3 pings de GPS simulando el trayecto → `complete` → `payment` (efectivo)
→ `rating` (ambos lados).

Resultado real observado:
- Cotización: `25 + 8×4.12km + 1.5×10min = $72.96` ✅ fórmula exacta
- Tarifa final recalculada con distancia GPS real:
  `25 + 8×2.28km + 1.5×0min = $43.24` ✅
- Score de despacho real calculado: `0.6036`
- **Bitácora de `trip_events` sin huecos**, las 8 transiciones exactas de
  la tabla de estados: `QUOTED → SEARCHING_DRIVER → DRIVER_ASSIGNED →
  DRIVER_ARRIVED → TRIP_IN_PROGRESS → PAYMENT_PENDING →
  PAYMENT_CONFIRMED → CLOSED`
- Comisión generada como **deuda** del conductor, no como pago:
  `gross=$43.24, commission_pct=10%, commission_amount=$4.32, driver_earning=$38.92`
- El conductor volvió a `AVAILABLE` con `available_since` reseteado

### Flujo FORANEO — probado de extremo a extremo

`POST /trips` (fuera del polígono de zona) → `PENDING_REVIEW` →
intento de despacho automático → **`409` explícito** (nunca se dispara
para FORANEO) → `POST /trips/{id}/review` (operador cotiza manual,
`quotedBy` queda registrado) → `POST /dispatch/manual-assign` (operador
asigna, con `reason` obligatorio auditado) → `DRIVER_ASSIGNED`.

### Permisos verificados con peticiones reales

| Acción | Sin el permiso | Con el permiso |
|---|---|---|
| `POST /trips/{id}/review` | `403` (DRIVER) | `200` (OPERATOR) |
| `POST /dispatch/manual-assign` | `403` (DRIVER) | `200` (OPERATOR) |

### Bugs reales encontrados y corregidos durante la implementación

1. El despacho automático se dispara por evento (`trip.quoted`) para
   evitar una dependencia circular `TripsModule ↔ DispatchModule`. La
   primera versión usaba `eventEmitter.emit()` (fire-and-forget): la
   respuesta HTTP salía antes de que el listener asíncrono terminara,
   dejando el viaje en `QUOTED` en vez de `SEARCHING_DRIVER` aunque
   hubiera un conductor elegible. Se corrigió usando `emitAsync()` y
   esperando el resultado.
2. `organizations.name` no tenía restricción `UNIQUE`, así que cada
   corrida del seed insertaba una fila nueva en vez de reutilizar la
   existente (se encontraron 3 organizaciones "Piloto" duplicadas). Se
   agregó la restricción en `db/schema.sql` y se corrigió el
   `ON CONFLICT` del seed.

### Lo que sigue siendo cierto de la especificación original

Todo lo marcado como "explícitamente fuera de alcance" en
`docs/02-especificacion-paso7.md` sigue así: sin WebSockets (el
conductor usa `GET /dispatch/offers/pending` por *polling*), sin Google
Distance Matrix real (sigue `HaversineDistanceProvider`), sin detección
de proximidad por GPS para auto-transicionar `DRIVER_EN_ROUTE`, sin
reintento en segundo plano cuando no hay candidatos.

## Próximo paso

Paso 8 — ver `docs/03-especificacion-paso8.md`. Antes de aceptar
usuarios reales, revisar en particular la sección 2 (rate limiting,
secretos reales, HTTPS) — nada de eso se implementó todavía porque no
era parte del alcance del paso 7.

---

## Paso 8 — Endurecimiento (parcialmente cerrado y verificado)

De la sección 2 de `docs/03-especificacion-paso8.md`, lo que **es
código** ya está implementado y probado con peticiones reales. Lo que
**es decisión de infraestructura de despliegue** (dónde correr esto, con
qué gestor de secretos, qué proveedor de respaldos) sigue documentado
como checklist, no inventado — depende de dónde se decida alojar el
piloto, algo que todavía no se definió.

### Implementado y verificado con peticiones reales

| Punto de la especificación | Estado | Prueba real |
|---|---|---|
| 2.1 Rate limiting en login | ✅ Cerrado | 5 intentos → `401`; 6to intento → `429` |
| 2.4 Filtro global de excepciones | ✅ Cerrado | Ruta inexistente devuelve JSON limpio, sin stack trace |
| 2.5 Logging estructurado | ✅ Cerrado | Salida JSON real confirmada en el log de arranque |

### Sigue pendiente — depende de dónde se despliegue

| Punto | Por qué no se cerró aquí |
|---|---|
| 2.2 Secretos reales (`JWT_SECRET` de producción) | El valor de desarrollo sigue en `.env.development`; el real debe vivir en el gestor de secretos del proveedor de hosting que se elija — no existe todavía |
| 2.3 HTTPS | Requiere un reverse proxy / balanceador delante del backend, que depende de la infraestructura de despliegue |
| 2.6 Respaldos de base de datos | Mecánica documentada en la sección 6 de `docs/03-especificacion-paso8.md`; requiere el proveedor de base de datos definitivo para programarlos |
| 2.7 Plan de rollback | Depende del mecanismo de despliegue (contenedores, PaaS, VM) que todavía no se decidió |

### Datos reales (sección 3 de la especificación)

Sigue sin cargarse: los montos de tarifa, el polígono real de cobertura,
y el % de comisión real siguen siendo los valores de desarrollo del
Ticket 7.0. Esos números los define el negocio — no se pueden inventar
aquí sin convertir una decisión comercial en un hecho técnico consumado.

### Siguiente paso concreto

Antes de continuar, hace falta una decisión que no es técnica: **dónde
se va a alojar el piloto** (qué proveedor de servidor/base de datos).
Esa decisión determina cómo se resuelven los cuatro puntos pendientes de
la tabla de arriba — no tiene sentido elegir un mecanismo de respaldos o
de rollback en abstracto, sin saber contra qué infraestructura real se
va a aplicar.
