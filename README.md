# Backend del piloto — Sistema Integral de Gestión de Taxis

Esqueleto NestJS (paso 5 del plan de ejecución), organizado en los módulos
de dominio definidos en `docs/01-fundamentos-tecnicos.md`. Construido sobre
`db/schema.sql` y el contrato `api/openapi.yaml`.

## Estado verificado

Este esqueleto fue compilado y arrancado en un entorno real durante su
construcción: PostgreSQL 16 + PostGIS 3.4, Redis, y los 13 módulos de
dominio cargando sin errores. La respuesta real obtenida de `/health`:

```json
{
  "status": "ok",
  "database": "connected",
  "serverTime": "2026-09-10T03:42:29.586Z",
  "postgis": "3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"
}
```

**Paso 6 (auth + RBAC + auditoría) también verificado con peticiones HTTP
reales**: login, JWT, permisos por rol (200 con permiso / 403 sin él) y
auditoría automática de escrituras — ver la tabla de pruebas en
`docs/01-fundamentos-tecnicos.md`.

Lo que **no** está probado todavía: no hay lógica de negocio de viajes
(eso es el paso 7 — el flujo vertical completo).

### Probarlo tú mismo

```bash
npm run seed   # crea org + roles + permisos + usuario admin@piloto.mx / Admin123!
npm run start:dev

curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@piloto.mx","password":"Admin123!"}'
# copiar el accessToken de la respuesta

curl http://localhost:3000/users/me -H "Authorization: Bearer TOKEN_AQUI"
```

## Requisitos

- Node.js 20+
- PostgreSQL 16 con la extensión PostGIS
- Redis

## Arranque local

```bash
# 1. Instalar dependencias
npm install --legacy-peer-deps

# 2. Crear la base de datos y aplicar el esquema (una sola vez)
createdb taxi_pilot_dev
psql -d taxi_pilot_dev -f db/schema.sql

# 3. Variables de entorno: ya viene .env.development listo para desarrollo
#    local (ajustar si tu Postgres/Redis usan otras credenciales)

# 4. Arrancar
npm run start:dev
```

`GET /health` debe responder `status: ok` con la versión de PostGIS si
todo quedó bien conectado.

## Estructura

```
src/
  main.ts                   # bootstrap, ValidationPipe global, CORS
  app.module.ts              # une config + database + redis + los 13 módulos
  config/env.validation.ts   # la app NO arranca si falta una env var crítica
  database/                  # conexión TypeORM a Postgres (synchronize:false —
                              # el esquema SIEMPRE se gestiona vía db/schema.sql)
  redis/                     # cliente Redis global (cache, GPS, sesiones)
  common/enums/               # enums que reflejan 1:1 los tipos de db/schema.sql
  modules/
    auth/          # AUTH — esqueleto, se implementa en el paso 6
    users/         # organizations, branches, roles, permissions, users
    passengers/    # PAS
    drivers/       # DRV
    vehicles/      # VEH
    gps/           # GPS — posición actual + histórico
    fares/         # FAR — zonas, tarifas por categoría, horario nocturno
    trips/         # TRP — núcleo del sistema
    dispatch/      # DSP — sin entidades propias, opera sobre trips/drivers/gps
    payments/      # PAY — confirmación de cobro (efectivo/terminal)
    finance/       # FIN — comisiones como deuda, liquidaciones
    ratings/       # RAT
    notifications/ # NTF
    audit/         # AUD — global, cualquier módulo puede inyectarlo
    configuration/ # parámetros configurables (gps.interval_seconds, etc.)
    health/        # healthcheck real contra la base de datos
```

## Ambientes

El repositorio solo contiene `.env.example`. Cada ambiente carga sus valores
desde el gestor de secretos o desde un archivo local ignorado (`.env.development`,
`.env.test`, `.env.staging` o `.env.production`); ningún secreto real se
versiona.

## Desarrollo local sin Docker

Si no tienes Postgres/Redis corriendo como servicios del sistema:

```bash
bash scripts/start-dev-services.sh
```

## Próximo paso

Paso 6: implementar auth (JWT), permisos por rol, y el interceptor de
auditoría — el núcleo transversal del que dependen todos los demás
módulos, antes de escribir la primera funcionalidad vertical de negocio.
