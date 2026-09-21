#!/usr/bin/env python3
"""
TTAPP — correcciones no relacionadas con pagos
Base auditada: main @ 29539a2e10cf4d24e8e58373b67f13b67078f522

Uso:
  python apply_ttapp_non_payment_fixes.py

Ejecutar desde la raíz del repositorio TTAPP.

Este script NO modifica:
- confirmPayment()
- Payment / payment_transactions
- Commission
- DriverSettlement
- lógica de liquidaciones/settlements
"""

from pathlib import Path
import sys

ROOT = Path.cwd()

def read(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        raise SystemExit(f"Falta archivo esperado: {path}")
    return p.read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: se esperaba 1 coincidencia y se encontraron {count}. Aborto para no aplicar un cambio inseguro.")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# 1) Rate limiting: login específico + cuotas operativas + tracker por usuario
# ---------------------------------------------------------------------
app_path = "src/app.module.ts"
app = read(app_path)
app = replace_once(
    app,
    "import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';",
    "import { ThrottlerModule } from '@nestjs/throttler';",
    "app.module import throttler",
)
app = replace_once(
    app,
    "import { PermissionsGuard } from './common/guards/permissions.guard';",
    "import { PermissionsGuard } from './common/guards/permissions.guard';\n"
    "import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';",
    "app.module custom throttler import",
)
app = replace_once(
    app,
    """    // 5 intentos por 15 minutos por IP+ruta — sobre todo para /auth/login
    // (fuerza bruta). docs/03-especificacion-paso8.md, seccion 2.1.
    ThrottlerModule.forRoot([{ ttl: 900000, limit: 5 }]),""",
    """    // Cuota global operativa. Las rutas sensibles definen limites propios.
    // Para rutas autenticadas el tracker usa user.id; para login/publicas usa IP.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),""",
    "app.module throttler config",
)
app = replace_once(
    app,
    "{ provide: APP_GUARD, useClass: ThrottlerGuard },",
    "{ provide: APP_GUARD, useClass: UserAwareThrottlerGuard },",
    "app.module throttler guard",
)
write(app_path, app)

write(
    "src/common/guards/user-aware-throttler.guard.ts",
    """import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id;
    if (userId) return `user:${userId}`;
    return `ip:${req.ip}`;
  }
}
""",
)

auth_path = "src/modules/auth/auth.controller.ts"
auth = read(auth_path)
auth = replace_once(
    auth,
    "import { Public } from '../../common/decorators/public.decorator';",
    "import { Public } from '../../common/decorators/public.decorator';\n"
    "import { Throttle } from '@nestjs/throttler';",
    "auth throttler import",
)
auth = replace_once(
    auth,
    "  @Public()\n  @Post('login')",
    "  @Public()\n  @Throttle({ default: { limit: 5, ttl: 900000 } })\n  @Post('login')",
    "auth login limit",
)
write(auth_path, auth)

gps_path = "src/modules/gps/gps.controller.ts"
gps = read(gps_path)
gps = replace_once(
    gps,
    "import { AuthenticatedUser } from '../auth/jwt-payload.interface';",
    "import { AuthenticatedUser } from '../auth/jwt-payload.interface';\n"
    "import { Throttle } from '@nestjs/throttler';",
    "gps throttler import",
)
gps = replace_once(
    gps,
    "  @Post()\n  @HttpCode(204)",
    "  @Post()\n  @Throttle({ default: { limit: 120, ttl: 60000 } })\n  @HttpCode(204)",
    "gps route quota",
)
write(gps_path, gps)

# ---------------------------------------------------------------------
# 2) RBAC: OPERATOR ve candidatos; DRIVER solo sus ofertas
# ---------------------------------------------------------------------
seed_path = "src/database/seeds/seed.ts"
seed = read(seed_path)
seed = replace_once(
    seed,
    """  OPERATOR: ['trips.view', 'trips.manage', 'trips.review', 'dispatch.manual_assign', 'fares.edit'],
  FINANCE: ['finance.view', 'finance.reconcile', 'trips.view'],
  DRIVER: ['dispatch.offers.view', 'dispatch.candidates.view'],""",
    """  OPERATOR: [
    'trips.view',
    'trips.manage',
    'trips.review',
    'dispatch.manual_assign',
    'dispatch.candidates.view',
    'fares.edit',
  ],
  FINANCE: ['finance.view', 'finance.reconcile', 'trips.view'],
  DRIVER: ['dispatch.offers.view'],""",
    "seed role permissions",
)
write(seed_path, seed)

# ---------------------------------------------------------------------
# 3) Aislamiento de viajes por organización
#    confirmPayment() queda intencionalmente sin modificar.
# ---------------------------------------------------------------------
trips_path = "src/modules/trips/trips.service.ts"
trips = read(trips_path)

trips = replace_once(
    trips,
    """    const origin = toGeoPoint(dto.origin);
    const destination = toGeoPoint(dto.destination);""",
    """    const passengerScope = await this.dataSource.query(
      `SELECT 1
       FROM passenger_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = $1 AND u.organization_id = $2
       LIMIT 1`,
      [passengerId, currentUser.organizationId],
    );
    if (passengerScope.length === 0) {
      throw new ForbiddenException('El pasajero no pertenece a tu organizacion');
    }

    const origin = toGeoPoint(dto.origin);
    const destination = toGeoPoint(dto.destination);""",
    "trips create passenger organization",
)

trips = replace_once(
    trips,
    "    const where: Record<string, unknown> = {};",
    "    const where: Record<string, unknown> = {\n"
    "      organization: { id: currentUser.organizationId },\n"
    "    };",
    "trips findAll organization",
)

trips = replace_once(
    trips,
    """    // Un PASSENGER solo ve sus propios viajes; un DRIVER solo los suyos.
    // Staff (OPERATOR/ADMIN/FINANCE) puede ver todo. Esto se fuerza aqui,
    // no se confia en lo que mande el query param.""",
    """    // Un PASSENGER solo ve sus propios viajes; un DRIVER solo los suyos.
    // Staff puede ver los viajes de SU organizacion. El organizationId
    // del JWT se fuerza siempre en la consulta.""",
    "trips findAll comment",
)

trips = replace_once(
    trips,
    """  async findOne(tripId: string, currentUser?: AuthenticatedUser): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { id: tripId },
      relations: ['passenger', 'driver', 'vehicle', 'quotedBy', 'fareRule'],
    });""",
    """  async findOne(tripId: string, currentUser?: AuthenticatedUser): Promise<Trip> {
    const where = currentUser
      ? { id: tripId, organization: { id: currentUser.organizationId } }
      : { id: tripId };
    const trip = await this.trips.findOne({
      where,
      relations: ['organization', 'passenger', 'driver', 'vehicle', 'quotedBy', 'fareRule'],
    });""",
    "trips findOne organization query",
)

trips = replace_once(
    trips,
    """  private canViewTrip(trip: Trip, currentUser: AuthenticatedUser): boolean {
    if (['OPERATOR', 'ADMIN', 'FINANCE'].includes(currentUser.role)) return true;
    return (""",
    """  private canViewTrip(trip: Trip, currentUser: AuthenticatedUser): boolean {
    if (!trip.organization || trip.organization.id !== currentUser.organizationId) return false;
    if (['OPERATOR', 'ADMIN', 'FINANCE'].includes(currentUser.role)) return true;
    return (""",
    "trips canView organization",
)

trips = replace_once(
    trips,
    """  private async loadForMutation(tripId: string): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { id: tripId },
      relations: ['passenger', 'driver', 'vehicle', 'fareRule'],
    });""",
    """  private async loadForMutation(
    tripId: string,
    currentUser?: AuthenticatedUser,
  ): Promise<Trip> {
    // currentUser se pasa en todas las mutaciones operativas. Se mantiene
    // opcional exclusivamente para no alterar el flujo de pagos en este cambio.
    const where = currentUser
      ? { id: tripId, organization: { id: currentUser.organizationId } }
      : { id: tripId };
    const trip = await this.trips.findOne({
      where,
      relations: ['organization', 'passenger', 'driver', 'vehicle', 'fareRule'],
    });""",
    "trips mutation loader",
)

for method in ("review", "arrive", "start", "complete", "cancel", "rate"):
    marker = f"  async {method}("
    pos = trips.find(marker)
    if pos < 0:
        raise SystemExit(f"No se encontró método {method}")
    call = "    const trip = await this.loadForMutation(tripId);"
    call_pos = trips.find(call, pos)
    if call_pos < 0:
        raise SystemExit(f"No se encontró loadForMutation en {method}")
    # Evitar modificar accidentalmente otro método: debe aparecer antes del siguiente método.
    next_method = trips.find("\n  async ", pos + len(marker))
    if next_method != -1 and call_pos > next_method:
        raise SystemExit(f"loadForMutation no pertenece a {method}")
    trips = trips[:call_pos] + "    const trip = await this.loadForMutation(tripId, currentUser);" + trips[call_pos + len(call):]

# Verificación explícita: el flujo de pagos debe conservar la llamada original.
payment_marker = "async confirmPayment("
payment_pos = trips.find(payment_marker)
if payment_pos < 0:
    raise SystemExit("No se encontró confirmPayment")
payment_loader = trips.find("const trip = await this.loadForMutation(tripId);", payment_pos)
if payment_loader < 0:
    raise SystemExit("confirmPayment fue alterado accidentalmente. Aborto.")

write(trips_path, trips)

# ---------------------------------------------------------------------
# 4) Aislamiento de despacho/candidatos por organización
# ---------------------------------------------------------------------
dispatch_controller_path = "src/modules/dispatch/dispatch.controller.ts"
dc = read(dispatch_controller_path)
dc = replace_once(
    dc,
    "import { Repository } from 'typeorm';",
    "import { Repository } from 'typeorm';\nimport { Throttle } from '@nestjs/throttler';",
    "dispatch controller throttle import",
)
dc = replace_once(
    dc,
    """  async start(@Param('tripId') tripId: string) {
    const trip = await this.trips.findOneOrFail({ where: { id: tripId } });""",
    """  async start(
    @Param('tripId') tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const trip = await this.trips.findOneOrFail({
      where: { id: tripId, organization: { id: user.organizationId } },
      relations: ['organization'],
    });""",
    "dispatch start organization",
)
dc = replace_once(
    dc,
    """  @RequirePermissions('dispatch.offers.view')
  @Get('dispatch/offers/pending')
  async pendingOffers(@CurrentUser() user: AuthenticatedUser) {
    const offers = await this.dispatchService.getPendingOffersForDriver(user.id);""",
    """  @RequirePermissions('dispatch.offers.view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get('dispatch/offers/pending')
  async pendingOffers(@CurrentUser() user: AuthenticatedUser) {
    const offers = await this.dispatchService.getPendingOffersForDriver(
      user.id,
      user.organizationId,
    );""",
    "dispatch offers quota/scope",
)
write(dispatch_controller_path, dc)

dispatch_path = "src/modules/dispatch/dispatch.service.ts"
ds = read(dispatch_path)
ds = replace_once(
    ds,
    """       FROM driver_profiles dp
       JOIN driver_vehicle_assignments dva ON dva.driver_id = dp.user_id AND dva.active = true
       JOIN vehicles v ON v.id = dva.vehicle_id
       JOIN driver_locations dl ON dl.driver_id = dp.user_id
       WHERE dp.status = 'AVAILABLE'""",
    """       FROM driver_profiles dp
       JOIN users du ON du.id = dp.user_id
       JOIN driver_vehicle_assignments dva ON dva.driver_id = dp.user_id AND dva.active = true
       JOIN vehicles v ON v.id = dva.vehicle_id
       JOIN driver_locations dl ON dl.driver_id = dp.user_id
       WHERE dp.status = 'AVAILABLE'
         AND du.organization_id = $5""",
    "dispatch eligible driver organization",
)
ds = replace_once(
    ds,
    """      [trip.origin.coordinates[0], trip.origin.coordinates[1], maxRadiusMeters, trip.id],""",
    """      [
        trip.origin.coordinates[0],
        trip.origin.coordinates[1],
        maxRadiusMeters,
        trip.id,
        trip.organization.id,
      ],""",
    "dispatch eligible params",
)
ds = replace_once(
    ds,
    """      `SELECT count(*)::int AS n FROM trips
       WHERE driver_id = $1 AND status = 'CANCELLED_BY_DRIVER' AND requested_at > now() - interval '24 hours'`,
      [row.driver_id],""",
    """      `SELECT count(*)::int AS n FROM trips
       WHERE driver_id = $1
         AND organization_id = $2
         AND status = 'CANCELLED_BY_DRIVER'
         AND requested_at > now() - interval '24 hours'`,
      [row.driver_id, organizationId],""",
    "dispatch cancellation organization",
)
ds = replace_once(
    ds,
    """  async getRankedCandidates(tripId: string, organizationId: string): Promise<ScoredCandidate[]> {
    const trip = await this.trips.findOneOrFail({ where: { id: tripId } });""",
    """  async getRankedCandidates(tripId: string, organizationId: string): Promise<ScoredCandidate[]> {
    const trip = await this.trips.findOneOrFail({
      where: { id: tripId, organization: { id: organizationId } },
      relations: ['organization'],
    });""",
    "dispatch ranked trip scope",
)
ds = replace_once(
    ds,
    """    const offer = await this.offers.findOne({
      where: { id: offerId },
      relations: ['trip', 'driver'],
    });
    if (!offer) throw new NotFoundException('Oferta no encontrada');""",
    """    const offer = await this.offers.findOne({
      where: { id: offerId },
      relations: ['trip', 'trip.organization', 'driver'],
    });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    if (offer.trip.organization.id !== currentUser.organizationId) {
      throw new ForbiddenException('Esta oferta pertenece a otra organizacion');
    }""",
    "dispatch offer organization",
)
ds = replace_once(
    ds,
    """  async getPendingOffersForDriver(driverId: string): Promise<TripAssignmentOffer[]> {
    return this.offers.find({
      where: { driver: { userId: driverId }, respondedAt: IsNull() },
      relations: ['trip'],""",
    """  async getPendingOffersForDriver(
    driverId: string,
    organizationId: string,
  ): Promise<TripAssignmentOffer[]> {
    return this.offers.find({
      where: {
        driver: { userId: driverId },
        trip: { organization: { id: organizationId } },
        respondedAt: IsNull(),
      },
      relations: ['trip', 'trip.organization'],""",
    "dispatch pending offers organization",
)
ds = replace_once(
    ds,
    """  async manualAssign(dto: ManualAssignDto, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: dto.tripId } });
    if (!trip) throw new NotFoundException('Viaje no encontrado');""",
    """  async manualAssign(dto: ManualAssignDto, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { id: dto.tripId, organization: { id: currentUser.organizationId } },
      relations: ['organization'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');""",
    "dispatch manual trip organization",
)
ds = replace_once(
    ds,
    """    const driver = await this.drivers.findOne({ where: { userId: dto.driverId } });
    if (!driver || driver.status !== 'AVAILABLE') {""",
    """    const driverScope = await this.dataSource.query(
      `SELECT 1
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.user_id = $1 AND u.organization_id = $2
       LIMIT 1`,
      [dto.driverId, currentUser.organizationId],
    );
    if (driverScope.length === 0) {
      throw new NotFoundException('Conductor no encontrado en esta organizacion');
    }

    const driver = await this.drivers.findOne({ where: { userId: dto.driverId } });
    if (!driver || driver.status !== 'AVAILABLE') {""",
    "dispatch manual driver organization",
)
write(dispatch_path, ds)

# ---------------------------------------------------------------------
# 5) Migración NO financiera de permisos/índice
# ---------------------------------------------------------------------
write(
    "db/migrations/20260920_non_payment_hardening.sql",
    """BEGIN;

-- H4/H5: permisos operativos sin ejecutar el seed destructivo.
INSERT INTO permissions (code)
VALUES
  ('dispatch.offers.view'),
  ('dispatch.candidates.view')
ON CONFLICT (code) DO NOTHING;

-- OPERATOR necesita consultar candidatos para poder realizar despacho manual.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'dispatch.candidates.view'
WHERE r.code = 'OPERATOR'
ON CONFLICT DO NOTHING;

-- DRIVER conserva únicamente la consulta de sus propias ofertas.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'dispatch.offers.view'
WHERE r.code = 'DRIVER'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'DRIVER'
  AND p.code = 'dispatch.candidates.view';

-- H7: ayuda a que el filtro obligatorio por organización sea eficiente.
CREATE INDEX IF NOT EXISTS idx_trips_organization
  ON trips (organization_id);

COMMIT;
""",
)

# ---------------------------------------------------------------------
# 6) Pruebas unitarias de regresión (sin pagos)
# ---------------------------------------------------------------------
write(
    "src/modules/trips/trips.service.spec.ts",
    """import { ForbiddenException } from '@nestjs/common';
import { TripsService } from './trips.service';

describe('TripsService organization isolation', () => {
  const makeService = (tripsRepo: any) =>
    new TripsService(
      tripsRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('forces organizationId in list queries', async () => {
    const tripsRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = makeService(tripsRepo);

    await service.findAll({} as any, {
      id: 'operator-a',
      organizationId: 'org-a',
      role: 'OPERATOR',
      permissions: ['trips.view'],
    });

    expect(tripsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization: { id: 'org-a' },
        }),
      }),
    );
  });

  it('rejects a trip from another organization even for OPERATOR', async () => {
    const tripsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'trip-b',
        organization: { id: 'org-b' },
        passenger: { userId: 'passenger-b' },
        driver: null,
      }),
    };
    const service = makeService(tripsRepo);

    await expect(
      service.findOne('trip-b', {
        id: 'operator-a',
        organizationId: 'org-a',
        role: 'OPERATOR',
        permissions: ['trips.view'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
""",
)

write(
    "src/modules/dispatch/dispatch.service.spec.ts",
    """import { DispatchService } from './dispatch.service';

describe('DispatchService organization isolation', () => {
  it('scopes candidate lookup to the caller organization', async () => {
    const trips = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 'trip-a',
        organization: { id: 'org-a' },
        origin: { coordinates: [-98.0, 20.0] },
      }),
    };
    const dataSource = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM configuration')) return Promise.resolve([]);
        if (sql.includes('FROM driver_profiles')) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
    };

    const service = new DispatchService(
      trips as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
    );

    await service.getRankedCandidates('trip-a', 'org-a');

    expect(trips.findOneOrFail).toHaveBeenCalledWith({
      where: { id: 'trip-a', organization: { id: 'org-a' } },
      relations: ['organization'],
    });
  });
});
""",
)

# ---------------------------------------------------------------------
# 7) CI mínimo: build + pruebas unitarias
# ---------------------------------------------------------------------
write(
    ".github/workflows/ci.yml",
    """name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm test -- --runInBand
""",
)

# ---------------------------------------------------------------------
# 8) README: ruta incorrecta + instrucciones de actualización no destructiva
# ---------------------------------------------------------------------
readme_path = "README.md"
readme = read(readme_path)
readme = replace_once(
    readme,
    """psql -d taxi_pilot_dev -f db/schema.sql
psql -d taxi_pilot_dev -f ../db/schema.sql""",
    """psql -d taxi_pilot_dev -f db/schema.sql""",
    "README schema duplicate",
)
anchor = "`GET /health` debe responder `status: ok` con la versión de PostGIS si\ntodo quedó bien conectado.\n"
addition = """`GET /health` debe responder `status: ok` con la versión de PostGIS si
todo quedó bien conectado.

### Actualizar una base ya existente

No vuelvas a ejecutar `db/schema.sql` sobre una base con datos. Para aplicar
el endurecimiento operativo de permisos y aislamiento sin tocar pagos:

```bash
psql -d taxi_pilot_dev -f db/migrations/20260920_non_payment_hardening.sql
```

Después de cambiar permisos, los usuarios afectados deben volver a iniciar
sesión para que el JWT incorpore la matriz actualizada.
"""
readme = replace_once(readme, anchor, addition, "README migration instructions")
write(readme_path, readme)

print("Correcciones no relacionadas con pagos aplicadas.")
print("Siguientes comandos recomendados:")
print("  npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund")
print("  npm run build")
print("  npm test -- --runInBand")
print("  git diff --check")
print("  git diff")
