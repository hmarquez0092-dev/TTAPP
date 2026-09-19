-- ============================================================
-- SISTEMA INTEGRAL DE GESTIÓN DE TAXIS — ESQUEMA DEL PILOTO (v1)
-- Alcance: módulos Must-have para 50-100 unidades
-- Motor: PostgreSQL 15+ con PostGIS
-- Ver: docs/01-fundamentos-tecnicos.md para las decisiones que
--      justifican cada campo marcado con un comentario de sección.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS postgis;

-- ------------------------------------------------------------
-- 1. ORGANIZACIÓN Y ESTRUCTURA
-- (Se mantiene organizations/branches para no romper la
--  arquitectura si se agrega multi-sucursal más adelante,
--  aunque en el piloto solo exista una fila de cada una)
-- ------------------------------------------------------------

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. USUARIOS, ROLES Y PERMISOS (RBAC — principio de mínimo privilegio)
-- ------------------------------------------------------------

CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

CREATE TABLE roles (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code  TEXT NOT NULL UNIQUE,     -- 'PASSENGER','DRIVER','OPERATOR','ADMIN','FINANCE'...
    name  TEXT NOT NULL
);

CREATE TABLE permissions (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code  TEXT NOT NULL UNIQUE      -- 'trips.view','fares.edit','users.block'...
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    branch_id       UUID REFERENCES branches(id),
    role_id         UUID NOT NULL REFERENCES roles(id),
    email           TEXT UNIQUE,
    phone           TEXT UNIQUE,
    password_hash   TEXT NOT NULL,
    status          user_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. PASAJEROS
-- ------------------------------------------------------------

CREATE TABLE passenger_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    average_rating  NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. CONDUCTORES Y VEHÍCULOS
-- ------------------------------------------------------------

-- Nota: driver_status y vehicle_status se mantienen SEPARADOS del estado
-- del viaje (trip_status), tal como exige la sección 19 del documento base.
CREATE TYPE driver_status AS ENUM (
    'OFFLINE', 'AVAILABLE', 'ON_SHIFT', 'BUSY', 'PAUSED', 'BLOCKED', 'EMERGENCY'
);

CREATE TABLE driver_profiles (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name        TEXT NOT NULL,
    license_number   TEXT NOT NULL,
    status           driver_status NOT NULL DEFAULT 'OFFLINE',
    average_rating   NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    available_since  TIMESTAMPTZ,   -- clave para el score de "justicia en la asignación"
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE driver_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id   UUID NOT NULL REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
    doc_type    TEXT NOT NULL,        -- 'LICENSE','ID','BACKGROUND_CHECK'...
    file_url    TEXT NOT NULL,
    expires_at  DATE,
    verified    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE vehicle_status AS ENUM (
    'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED'
);

CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    plate           TEXT NOT NULL UNIQUE,
    brand           TEXT,
    model           TEXT,
    year            INT,
    vehicle_type    TEXT NOT NULL DEFAULT 'STANDARD',  -- usado en el filtro de compatibilidad DSP
    status          vehicle_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    doc_type    TEXT NOT NULL,        -- 'INSURANCE','PERMIT'...
    file_url    TEXT NOT NULL,
    expires_at  DATE,
    verified    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE driver_vehicle_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES driver_profiles(user_id),
    vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
    active          BOOLEAN NOT NULL DEFAULT true,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at   TIMESTAMPTZ
);

CREATE TABLE driver_shifts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id   UUID NOT NULL REFERENCES driver_profiles(user_id),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 5. GEODATOS
-- ------------------------------------------------------------

-- Última posición conocida (se sobrescribe) — para respuestas rápidas del mapa
CREATE TABLE driver_locations (
    driver_id   UUID PRIMARY KEY REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
    position    GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh   NUMERIC(5,2),
    heading     NUMERIC(5,2),
    accuracy_m  NUMERIC(6,2),
    recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_driver_locations_position ON driver_locations USING GIST (position);

-- Histórico completo — para reproducción de viajes y auditoría
CREATE TABLE driver_location_history (
    id          BIGSERIAL PRIMARY KEY,
    driver_id   UUID NOT NULL REFERENCES driver_profiles(user_id),
    position    GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh   NUMERIC(5,2),
    heading     NUMERIC(5,2),
    recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_location_history_driver_time ON driver_location_history (driver_id, recorded_at);
-- Nota: particionar esta tabla por fecha queda diferido (Won't have) hasta que
-- el volumen real del piloto lo justifique; el modelo ya lo permite sin cambios.

CREATE TABLE service_zones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    area            GEOGRAPHY(POLYGON, 4326) NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_service_zones_area ON service_zones USING GIST (area);

-- ------------------------------------------------------------
-- 6. TARIFAS (versionado inmutable — sección 18, Parte I)
-- ------------------------------------------------------------

-- NORMAL: servicio local en horario diurno.
-- NOCTURNO: mismo tipo de servicio pero con tarifario propio (no un
--           porcentaje sobre NORMAL) activo en el horario que defina
--           fare_schedules.
-- FORANEO: viaje fuera de las zonas de cobertura. No se cotiza ni se
--          despacha automáticamente — ver PENDING_REVIEW en trip_status.
CREATE TYPE service_category AS ENUM ('NORMAL', 'NOCTURNO', 'FORANEO');

-- Una fila por combinación (categoría, zona/colonia, vigencia). zone_id
-- NULL = tarifa por defecto de esa categoría cuando la colonia del origen
-- no tiene una tarifa específica cargada. Así se deja abierta la carga de
-- cuotas por colonia sin necesidad de cambiar el esquema después.
CREATE TABLE fare_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    service_category    service_category NOT NULL,
    zone_id             UUID REFERENCES service_zones(id),  -- colonia/zona; NULL = tarifa por defecto de la categoría
    name                TEXT NOT NULL,
    version             INT NOT NULL,
    base_fare           NUMERIC(10,2) NOT NULL,
    cost_per_km         NUMERIC(10,2) NOT NULL,
    cost_per_minute     NUMERIC(10,2) NOT NULL,
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_to            TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT, PUBLISHED, ARCHIVED
    created_by          UUID NOT NULL REFERENCES users(id),
    published_by        UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- REGLA DE NEGOCIO: nunca se hace UPDATE sobre una fila con status='PUBLISHED'.
-- Un cambio de tarifa siempre inserta una nueva fila y cierra la anterior (valid_to = now()).

-- Controla cuándo se activa la categoría NOCTURNO. Se evalúa por horario
-- (start_time/end_time) pero además permite forzar manualmente el estado
-- desde el centro de monitoreo — por ejemplo, activar nocturno antes de
-- tiempo un día de evento especial — sin depender solo del reloj.
CREATE TABLE fare_schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id),
    service_category  service_category NOT NULL,   -- normalmente 'NOCTURNO'
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    manual_override   TEXT,        -- NULL = usar horario automático; 'FORCE_ON' / 'FORCE_OFF' para forzar
    overridden_by     UUID REFERENCES users(id),
    overridden_at     TIMESTAMPTZ,
    active            BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- 7. VIAJES — núcleo del sistema
-- ------------------------------------------------------------

-- PENDING_REVIEW: exclusivo de FORANEO — el viaje espera a que un
-- operador del centro de monitoreo lo revise y asigne una tarifa antes
-- de poder cotizarse o despacharse automáticamente.
CREATE TYPE trip_status AS ENUM (
    'REQUESTED', 'PENDING_REVIEW', 'QUOTED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_IN_PROGRESS', 'TRIP_COMPLETED',
    'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'CLOSED',
    'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SYSTEM',
    'NO_SHOW', 'DISPUTED'
);


CREATE TABLE trips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    passenger_id        UUID NOT NULL REFERENCES passenger_profiles(user_id),
    driver_id           UUID REFERENCES driver_profiles(user_id),
    vehicle_id          UUID REFERENCES vehicles(id),
    fare_rule_id        UUID REFERENCES fare_rules(id),
    service_category    service_category NOT NULL DEFAULT 'NORMAL',
    status              trip_status NOT NULL DEFAULT 'REQUESTED',
    origin              GEOGRAPHY(POINT, 4326) NOT NULL,
    destination         GEOGRAPHY(POINT, 4326) NOT NULL,
    quoted_fare         NUMERIC(10,2),
    quoted_by           UUID REFERENCES users(id),  -- operador que autorizó la tarifa manual (solo FORANEO); NULL = cotización automática
    final_fare          NUMERIC(10,2),
    distance_km         NUMERIC(8,2),
    duration_min        NUMERIC(8,2),
    security_code       TEXT,          -- código de inicio de viaje, sección 42 Parte I
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancellation_reason TEXT
);
CREATE INDEX idx_trips_status    ON trips (status);
CREATE INDEX idx_trips_driver    ON trips (driver_id);
CREATE INDEX idx_trips_passenger ON trips (passenger_id);
CREATE INDEX idx_trips_category  ON trips (service_category);

-- Bitácora inmutable de transiciones — nunca se borra ni se edita (secciones 21-22, Parte I)
CREATE TABLE trip_events (
    id              BIGSERIAL PRIMARY KEY,
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_status     trip_status,
    to_status       trip_status NOT NULL,
    actor_user_id   UUID REFERENCES users(id),   -- NULL si la transición la hizo el sistema
    reason          TEXT,
    position        GEOGRAPHY(POINT, 4326),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_events_trip ON trip_events (trip_id, occurred_at);

-- Ofertas de despacho a cada conductor candidato (DSP-004)
CREATE TABLE trip_assignment_offers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    driver_id     UUID NOT NULL REFERENCES driver_profiles(user_id),
    score         NUMERIC(6,4),
    offered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ,
    response      TEXT,                 -- 'ACCEPTED','REJECTED','EXPIRED'
    manual        BOOLEAN NOT NULL DEFAULT false,
    assigned_by   UUID REFERENCES users(id)   -- operador, si fue asignación manual (sección 26)
);

-- ------------------------------------------------------------
-- 8. PAGOS Y FINANZAS
-- ------------------------------------------------------------

-- El conductor cobra directo al pasajero (efectivo o su propia terminal
-- bancaria); la plataforma no retiene ese dinero. Por eso la confirmación
-- es manual del conductor, no una notificación automática de una pasarela.
CREATE TABLE payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           UUID NOT NULL UNIQUE REFERENCES trips(id),
    amount            NUMERIC(10,2) NOT NULL,
    method            TEXT NOT NULL,     -- 'CASH','CARD_TERMINAL','DIGITAL_INAPP'
    reference_number  TEXT,              -- folio de la terminal bancaria, si aplica (solo auditoría)
    confirmed_by      UUID REFERENCES users(id),  -- normalmente el propio conductor
    status            TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, DRIVER_CONFIRMED, DISPUTED
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo aplica al método DIGITAL_INAPP (pasarela dentro de la app).
-- Fuera de alcance del piloto, pero se conserva para no bloquear esa
-- opción a futuro sin rediseñar el esquema. CASH y CARD_TERMINAL no
-- generan fila aquí: su confirmación vive directamente en `payments`.
CREATE TABLE payment_transactions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id         UUID NOT NULL REFERENCES payments(id),
    provider           TEXT NOT NULL,   -- 'stripe','mercadopago','openpay'
    provider_reference TEXT,
    idempotency_key    TEXT NOT NULL UNIQUE,  -- sección 81, Parte I: nunca duplicar un pago
    status             TEXT NOT NULL,
    raw_response       JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Por viaje: lo que el conductor le debe a la empresa, no un pago que
-- la empresa le hace. Con CASH/CARD_TERMINAL el conductor ya se quedó
-- con driver_earning al momento del viaje; commission_amount es la
-- deuda pendiente que se liquida después (ver driver_settlements).
CREATE TABLE commissions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id            UUID NOT NULL REFERENCES trips(id),
    gross_amount       NUMERIC(10,2) NOT NULL,
    commission_pct     NUMERIC(5,2) NOT NULL,
    commission_amount  NUMERIC(10,2) NOT NULL,  -- deuda del conductor con la empresa por este viaje
    driver_earning     NUMERIC(10,2) NOT NULL,  -- lo que el conductor ya se quedó (gross_amount - commission_amount)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Acumula la deuda de comisión de un conductor por periodo (ej. semanal).
-- total_commission = lo que el conductor debe pagarle a la empresa en
-- ese periodo, no lo que la empresa le paga a él.
CREATE TABLE driver_settlements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id         UUID NOT NULL REFERENCES driver_profiles(user_id),
    period_start      DATE NOT NULL,
    period_end        DATE NOT NULL,
    total_earnings    NUMERIC(10,2) NOT NULL,   -- referencia informativa: total cobrado por el conductor en el periodo
    total_commission  NUMERIC(10,2) NOT NULL,   -- deuda total del conductor con la empresa en el periodo
    status            TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN, RECONCILED, PAID
    reconciled_by     UUID REFERENCES users(id),
    reconciled_at     TIMESTAMPTZ
);

-- Rastro auditable de cada pago que el conductor hace a la empresa para
-- saldar su deuda de comisión (regla de oro, sección 117 Parte I: quién,
-- cuánto, cuándo, cómo). Puede haber varios pagos parciales por settlement.
CREATE TABLE settlement_payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id     UUID NOT NULL REFERENCES driver_settlements(id),
    amount            NUMERIC(10,2) NOT NULL,
    method            TEXT NOT NULL,     -- 'CASH_DROP','TRANSFER','DEPOSIT_DEDUCTION'
    reference_number  TEXT,
    received_by       UUID REFERENCES users(id),   -- operador/finanzas que recibió el pago
    paid_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 9. CALIFICACIONES (una por viaje por usuario — RAT-002)
-- ------------------------------------------------------------

CREATE TABLE ratings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id),
    rated_by    UUID NOT NULL REFERENCES users(id),
    rated_user  UUID NOT NULL REFERENCES users(id),
    score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_id, rated_by)
);

-- ------------------------------------------------------------
-- 10. NOTIFICACIONES
-- ------------------------------------------------------------

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    event_type  TEXT NOT NULL,   -- 'TRIP_ASSIGNED','DRIVER_ARRIVED','PAYMENT_CONFIRMED'...
    channel     TEXT NOT NULL,   -- 'PUSH','SMS','EMAIL'
    payload     JSONB,
    sent_at     TIMESTAMPTZ,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 11. CONFIGURACIÓN Y AUDITORÍA (transversales a todo el sistema)
-- ------------------------------------------------------------

CREATE TABLE configuration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    key             TEXT NOT NULL,
    value           JSONB NOT NULL,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, key)
);
-- Ejemplos de filas:
--   key='gps.interval_seconds'  value='5'
--   key='dispatch.weights'      value='{"proximity":0.40,"eta":0.25,"idle_time":0.20,"rating":0.10,"cancellations":0.05}'

-- Regla de oro (sección 117, Parte I): quién, qué, cuándo, sobre qué registro,
-- valor anterior, valor nuevo, por qué. Tabla append-only, nunca se edita ni se borra.
CREATE TABLE audit_logs (
    id             BIGSERIAL PRIMARY KEY,
    actor_user_id  UUID REFERENCES users(id),
    action         TEXT NOT NULL,
    entity         TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    old_value      JSONB,
    new_value      JSONB,
    reason         TEXT,
    ip_address     INET,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity, entity_id);
