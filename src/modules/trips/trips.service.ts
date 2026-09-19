import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Trip } from './entities/trip.entity';
import { TripEvent } from './entities/trip-event.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverLocationHistory } from '../gps/entities/driver-location-history.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Commission } from '../finance/entities/commission.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { FareCalculationService } from '../fares/fare-calculation.service';
import { ServiceCategory, TripStatus } from '../../common/enums';
import { assertTransition, round2 } from './trip-state.util';
import { toGeoPoint } from '../../common/types/geo.util';
import { TripCreateDto } from './dto/trip-create.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { ForaneoReviewDto } from './dto/foraneo-review.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';

interface PaymentConfirmInput {
  method: 'CASH' | 'CARD_TERMINAL';
  amount: number;
  referenceNumber?: string;
}

interface RatingInput {
  score: number;
  comment?: string;
}

const ASSIGNED_STATES = [
  TripStatus.DRIVER_ASSIGNED,
  TripStatus.DRIVER_EN_ROUTE,
  TripStatus.DRIVER_ARRIVED,
];

// Tolerancia de discrepancia de monto en efectivo/terminal (pesos MXN) —
// ver Ticket 7.17. Por debajo de esto no vale la pena bloquear al conductor.
const PAYMENT_AMOUNT_TOLERANCE = 5;

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripEvent) private readonly tripEvents: Repository<TripEvent>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(DriverLocationHistory)
    private readonly locationHistory: Repository<DriverLocationHistory>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Commission) private readonly commissions: Repository<Commission>,
    @InjectRepository(Rating) private readonly ratings: Repository<Rating>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fareCalculationService: FareCalculationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  // ----------------------------------------------------------------
  // Ticket 7.4 — crear viaje
  // ----------------------------------------------------------------
  async create(dto: TripCreateDto, currentUser: AuthenticatedUser): Promise<Trip> {
    // Un PASSENGER solo puede crear viajes para si mismo. Solo staff
    // (OPERATOR/ADMIN, via el permiso trips.manage) puede especificar un
    // passengerId distinto — y ese caso queda auditado explicitamente.
    let passengerId = currentUser.id;
    if (currentUser.role !== 'PASSENGER' && dto.passengerId) {
      if (!['OPERATOR', 'ADMIN'].includes(currentUser.role) || !currentUser.permissions.includes('trips.manage')) {
        throw new ForbiddenException('Requiere el permiso trips.manage para crear viajes a nombre de terceros');
      }
      passengerId = dto.passengerId;
    }

    const origin = toGeoPoint(dto.origin);
    const destination = toGeoPoint(dto.destination);

    const quote = await this.fareCalculationService.quote(
      origin,
      destination,
      currentUser.organizationId,
    );

    const trip = this.trips.create({
      organization: { id: currentUser.organizationId } as any,
      passenger: { userId: passengerId } as any,
      origin,
      destination,
      serviceCategory: quote.serviceCategory,
      status:
        quote.serviceCategory === ServiceCategory.FORANEO
          ? TripStatus.PENDING_REVIEW
          : TripStatus.QUOTED,
      quotedFare: quote.estimatedFare,
      fareRule: quote.fareRuleId ? ({ id: quote.fareRuleId } as any) : null,
      distanceKm: quote.estimatedDistanceKm,
      durationMin: quote.estimatedDurationMin,
      securityCode: String(Math.floor(1000 + Math.random() * 9000)),
    });
    await this.trips.save(trip);

    if (passengerId !== currentUser.id) {
      await this.auditService.record({
        actorUserId: currentUser.id,
        action: 'trip.create_on_behalf',
        entity: 'trips',
        entityId: trip.id,
        newValue: { passengerId, createdBy: currentUser.id },
        reason: 'Viaje creado por staff a nombre de otro pasajero',
      });
    }

    await this.recordEvent(trip.id, null, trip.status, currentUser.id, 'trip_requested');

    // Solo NORMAL/NOCTURNO disparan despacho automatico. Se usa emitAsync
    // (no emit) y se espera el resultado: asi la respuesta HTTP refleja
    // si ya se encontro conductor (SEARCHING_DRIVER) o no (se queda en
    // QUOTED). Evita tambien una condicion de carrera donde el handler
    // asincrono corre despues de que la respuesta ya salio.
    if (quote.serviceCategory !== ServiceCategory.FORANEO) {
      await this.eventEmitter.emitAsync('trip.quoted', { tripId: trip.id });
    }

    return this.findOne(trip.id);
  }

  // ----------------------------------------------------------------
  // Ticket 7.5 — listar / consultar
  // ----------------------------------------------------------------
  async findAll(query: ListTripsQueryDto, currentUser: AuthenticatedUser): Promise<Trip[]> {
    const where: Record<string, unknown> = {};

    // Un PASSENGER solo ve sus propios viajes; un DRIVER solo los suyos.
    // Staff (OPERATOR/ADMIN/FINANCE) puede ver todo. Esto se fuerza aqui,
    // no se confia en lo que mande el query param.
    if (currentUser.role === 'PASSENGER') {
      where.passenger = { userId: currentUser.id };
    } else if (currentUser.role === 'DRIVER') {
      where.driver = { userId: currentUser.id };
    } else {
      if (query.passengerId) where.passenger = { userId: query.passengerId };
      if (query.driverId) where.driver = { userId: query.driverId };
    }
    if (query.status && query.status.length > 0) {
      where.status = In(query.status);
    }

    return this.trips.find({
      where,
      relations: ['passenger', 'driver', 'vehicle', 'quotedBy'],
      order: { requestedAt: 'DESC' },
    });
  }

  async findOne(tripId: string, currentUser?: AuthenticatedUser): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { id: tripId },
      relations: ['passenger', 'driver', 'vehicle', 'quotedBy', 'fareRule'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (currentUser && !this.canViewTrip(trip, currentUser)) {
      throw new ForbiddenException('No tienes acceso a este viaje');
    }
    return trip;
  }

  private canViewTrip(trip: Trip, currentUser: AuthenticatedUser): boolean {
    if (['OPERATOR', 'ADMIN', 'FINANCE'].includes(currentUser.role)) return true;
    return (
      (currentUser.role === 'PASSENGER' && trip.passenger?.userId === currentUser.id) ||
      (currentUser.role === 'DRIVER' && trip.driver?.userId === currentUser.id)
    );
  }

  private async loadForMutation(tripId: string): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { id: tripId },
      relations: ['passenger', 'driver', 'vehicle', 'fareRule'],
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip;
  }

  private assertIsAssignedDriver(
    trip: Trip,
    currentUser: AuthenticatedUser,
  ): asserts trip is Trip & { driver: DriverProfile } {
    if (!trip.driver || trip.driver.userId !== currentUser.id) {
      throw new ForbiddenException('Solo el conductor asignado puede hacer esto');
    }
  }

  private async recordEvent(
    tripId: string,
    fromStatus: TripStatus | null,
    toStatus: TripStatus,
    actorUserId: string | null,
    reason: string | null = null,
  ): Promise<void> {
    await this.tripEvents.save(
      this.tripEvents.create({
        trip: { id: tripId } as any,
        fromStatus,
        toStatus,
        actorUser: actorUserId ? ({ id: actorUserId } as any) : null,
        reason,
      }),
    );
  }

  // ----------------------------------------------------------------
  // Ticket 7.6 — revision manual FORANEO
  // ----------------------------------------------------------------
  async review(tripId: string, dto: ForaneoReviewDto, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.loadForMutation(tripId);
    assertTransition(trip, [TripStatus.PENDING_REVIEW]);

    trip.quotedFare = dto.quotedFare;
    trip.quotedBy = { id: currentUser.id } as any;
    trip.status = TripStatus.QUOTED;
    await this.trips.save(trip);

    await this.recordEvent(tripId, TripStatus.PENDING_REVIEW, TripStatus.QUOTED, currentUser.id);

    await this.auditService.record({
      actorUserId: currentUser.id,
      action: 'trip.foraneo_quoted',
      entity: 'trips',
      entityId: tripId,
      oldValue: { quotedFare: null },
      newValue: { quotedFare: dto.quotedFare },
      reason: dto.notes ?? null,
    });

    // NUNCA dispara despacho automatico para FORANEO — el operador debe
    // usar /dispatch/manual-assign explicitamente.
    return this.findOne(tripId);
  }

  // ----------------------------------------------------------------
  // Ticket 7.14 — conductor llega al origen
  // ----------------------------------------------------------------
  async arrive(tripId: string, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.loadForMutation(tripId);
    this.assertIsAssignedDriver(trip, currentUser);
    assertTransition(trip, [TripStatus.DRIVER_ASSIGNED, TripStatus.DRIVER_EN_ROUTE]);

    const from = trip.status;
    trip.status = TripStatus.DRIVER_ARRIVED;
    await this.trips.save(trip);
    await this.recordEvent(tripId, from, trip.status, currentUser.id);
    return this.findOne(tripId);
  }

  // ----------------------------------------------------------------
  // Ticket 7.15 — iniciar viaje (valida codigo de seguridad)
  // ----------------------------------------------------------------
  async start(tripId: string, securityCode: string, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.loadForMutation(tripId);
    this.assertIsAssignedDriver(trip, currentUser);
    assertTransition(trip, [TripStatus.DRIVER_ARRIVED]);

    if (trip.securityCode !== securityCode) {
      throw new ForbiddenException('Codigo de seguridad incorrecto');
    }

    trip.status = TripStatus.TRIP_IN_PROGRESS;
    trip.startedAt = new Date();
    await this.trips.save(trip);
    await this.recordEvent(tripId, TripStatus.DRIVER_ARRIVED, trip.status, currentUser.id);
    return this.findOne(tripId);
  }

  // ----------------------------------------------------------------
  // Ticket 7.16 — completar viaje (distancia/tarifa real)
  // ----------------------------------------------------------------
  async complete(tripId: string, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.loadForMutation(tripId);
    this.assertIsAssignedDriver(trip, currentUser);
    assertTransition(trip, [TripStatus.TRIP_IN_PROGRESS]);

    if (!trip.startedAt) {
      throw new ForbiddenException('El viaje no tiene hora de inicio registrada');
    }
    const { distanceKm, durationMin } = await this.computeActualTrip(
      trip.driver.userId,
      trip.startedAt,
      trip.origin,
      trip.destination,
    );

    let finalFare: number;
    if (trip.serviceCategory === ServiceCategory.FORANEO) {
      // La tarifa manual ya es definitiva — no se recalcula con la
      // distancia/tiempo reales.
      finalFare = Number(trip.quotedFare);
    } else {
      if (!trip.fareRule) {
        throw new ForbiddenException('El viaje no tiene una tarifa aplicable registrada');
      }
      const fareRule = trip.fareRule;
      finalFare = round2(
        Number(fareRule.baseFare) +
          Number(fareRule.costPerKm) * distanceKm +
          Number(fareRule.costPerMinute) * durationMin,
      );
    }

    trip.distanceKm = distanceKm;
    trip.durationMin = durationMin;
    trip.finalFare = finalFare;
    trip.completedAt = new Date();
    trip.status = TripStatus.PAYMENT_PENDING;
    await this.trips.save(trip);
    await this.recordEvent(tripId, TripStatus.TRIP_IN_PROGRESS, trip.status, currentUser.id);

    // Libera al conductor Y le resetea el reloj de "justicia en la
    // asignacion" (ver Ticket 7.12 / docs/01-fundamentos-tecnicos.md 2.1)
    await this.drivers.update(trip.driver.userId, {
      status: 'AVAILABLE' as any,
      availableSince: new Date(),
    });

    return this.findOne(tripId);
  }

  private async computeActualTrip(
    driverId: string,
    startedAt: Date,
    origin: Trip['origin'],
    destination: Trip['destination'],
  ): Promise<{ distanceKm: number; durationMin: number }> {
    const durationMin = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));

    const rows = await this.dataSource.query(
      `WITH pts AS (
         SELECT position::geometry AS geom, recorded_at
         FROM driver_location_history
         WHERE driver_id = $1 AND recorded_at BETWEEN $2 AND now()
         ORDER BY recorded_at
       )
       SELECT
         CASE WHEN count(*) >= 2
           THEN ST_Length(ST_MakeLine(geom ORDER BY recorded_at)::geography)
           ELSE NULL
         END AS meters,
         count(*) AS point_count
       FROM pts`,
      [driverId, startedAt],
    );

    const row = rows[0];
    let distanceKm: number;
    if (row.point_count >= 2 && row.meters != null) {
      distanceKm = round2(Number(row.meters) / 1000);
    } else {
      // Fallback: linea recta origen-destino x factor vial, igual que el
      // estimador del Ticket 7.1 — no hubo suficientes pings de GPS.
      const straight = await this.dataSource.query(
        `SELECT ST_Distance(
           ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
           ST_SetSRID(ST_MakePoint($3,$4),4326)::geography
         ) AS meters`,
        [origin.coordinates[0], origin.coordinates[1], destination.coordinates[0], destination.coordinates[1]],
      );
      distanceKm = round2((Number(straight[0].meters) / 1000) * 1.35);
    }

    return { distanceKm, durationMin };
  }

  // ----------------------------------------------------------------
  // Ticket 7.17 — confirmar cobro (efectivo / terminal)
  // ----------------------------------------------------------------
  async confirmPayment(
    tripId: string,
    dto: PaymentConfirmInput,
    currentUser: AuthenticatedUser,
  ): Promise<Payment> {
    const trip = await this.loadForMutation(tripId);
    this.assertIsAssignedDriver(trip, currentUser);
    assertTransition(trip, [TripStatus.PAYMENT_PENDING]);

    const finalFare = Number(trip.finalFare);
    if (Math.abs(dto.amount - finalFare) > PAYMENT_AMOUNT_TOLERANCE) {
      // No bloquea el flujo — los conductores redondean efectivo. Solo
      // queda auditado para revision posterior.
      await this.auditService.record({
        actorUserId: currentUser.id,
        action: 'payment.amount_mismatch',
        entity: 'trips',
        entityId: tripId,
        oldValue: { finalFare },
        newValue: { confirmedAmount: dto.amount },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedTrip = await manager.findOne(Trip, {
        where: { id: tripId },
        relations: ['driver', 'passenger'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedTrip) throw new NotFoundException('Viaje no encontrado');
      if (!lockedTrip.driver || lockedTrip.driver.userId !== currentUser.id) {
        throw new ForbiddenException('Solo el conductor asignado puede confirmar el pago');
      }

      const existingPayment = await manager.findOne(Payment, {
        where: { trip: { id: tripId } },
      });
      if (existingPayment) return existingPayment;
      if (lockedTrip.status !== TripStatus.PAYMENT_PENDING) {
        throw new ConflictException('El pago de este viaje ya fue confirmado');
      }

      const payment = manager.create(Payment, {
        trip: { id: tripId } as any,
        amount: dto.amount,
        method: dto.method as any,
        referenceNumber: dto.referenceNumber ?? null,
        confirmedBy: { id: currentUser.id } as any,
        status: 'DRIVER_CONFIRMED',
      });
      await manager.save(payment);

      const commissionPctRow = await manager.query(
        `SELECT value FROM configuration WHERE organization_id = $1 AND key = 'commission.default_pct' LIMIT 1`,
        [currentUser.organizationId],
      );
      const commissionPct = commissionPctRow.length > 0 ? Number(commissionPctRow[0].value) : 10;

      const commissionAmount = round2(finalFare * (commissionPct / 100));
      const driverEarning = round2(finalFare - commissionAmount);

      const commission = manager.create(Commission, {
        trip: { id: tripId } as any,
        grossAmount: finalFare,
        commissionPct,
        commissionAmount,
        driverEarning,
      });
      await manager.save(commission);

      await manager.query(
        `INSERT INTO driver_settlements
           (driver_id, period_start, period_end, total_earnings, total_commission, status)
         VALUES ($1, date_trunc('week', CURRENT_DATE)::date,
                    (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
                    $2, $3, 'OPEN')
         ON CONFLICT (driver_id, period_start, period_end)
         DO UPDATE SET
           total_earnings = driver_settlements.total_earnings + EXCLUDED.total_earnings,
           total_commission = driver_settlements.total_commission + EXCLUDED.total_commission`,
        [lockedTrip.driver.userId, finalFare, commissionAmount],
      );

      await manager.update(Trip, tripId, { status: TripStatus.PAYMENT_CONFIRMED });
      await manager.save(
        manager.create(TripEvent, {
          trip: { id: tripId } as any,
          fromStatus: TripStatus.PAYMENT_PENDING,
          toStatus: TripStatus.PAYMENT_CONFIRMED,
          actorUser: { id: currentUser.id } as any,
        }),
      );

      await manager.update(Trip, tripId, { status: TripStatus.CLOSED });
      await manager.save(
        manager.create(TripEvent, {
          trip: { id: tripId } as any,
          fromStatus: TripStatus.PAYMENT_CONFIRMED,
          toStatus: TripStatus.CLOSED,
          actorUser: null,
          reason: 'pago_confirmado',
        }),
      );

      return payment;
    });
  }

  // ----------------------------------------------------------------
  // Ticket 7.18 — cancelar
  // ----------------------------------------------------------------
  async cancel(tripId: string, dto: CancelTripDto, currentUser: AuthenticatedUser): Promise<Trip> {
    const trip = await this.loadForMutation(tripId);
    assertTransition(trip, [
      TripStatus.REQUESTED,
      TripStatus.PENDING_REVIEW,
      TripStatus.QUOTED,
      TripStatus.SEARCHING_DRIVER,
      ...ASSIGNED_STATES,
    ]);

    const from = trip.status;
    const driverToFree = ASSIGNED_STATES.includes(from) ? trip.driver : null;

    trip.status =
      dto.cancelledBy === 'PASSENGER'
        ? TripStatus.CANCELLED_BY_PASSENGER
        : dto.cancelledBy === 'DRIVER'
          ? TripStatus.CANCELLED_BY_DRIVER
          : TripStatus.CANCELLED_BY_SYSTEM;
    trip.cancellationReason = dto.reason;
    await this.trips.save(trip);
    await this.recordEvent(tripId, from, trip.status, currentUser.id, dto.reason);

    if (driverToFree) {
      await this.drivers.update(driverToFree.userId, {
        status: 'AVAILABLE' as any,
        availableSince: new Date(),
      });
    }

    return this.findOne(tripId);
  }

  // ----------------------------------------------------------------
  // Ticket 7.19 — calificar
  // ----------------------------------------------------------------
  async rate(tripId: string, dto: RatingInput, currentUser: AuthenticatedUser): Promise<Rating> {
    const trip = await this.loadForMutation(tripId);
    if (![TripStatus.PAYMENT_CONFIRMED, TripStatus.CLOSED].includes(trip.status)) {
      throw new ForbiddenException('El viaje todavia no se puede calificar');
    }

    let ratedUserId: string;
    if (trip.passenger.userId === currentUser.id && trip.driver) {
      ratedUserId = trip.driver.userId;
    } else if (trip.driver?.userId === currentUser.id) {
      ratedUserId = trip.passenger.userId;
    } else {
      throw new ForbiddenException('No participaste en este viaje');
    }

    try {
      const rating = this.ratings.create({
        trip: { id: tripId } as any,
        ratedBy: { id: currentUser.id } as any,
        ratedUser: { id: ratedUserId } as any,
        score: dto.score,
        comment: dto.comment ?? null,
      });
      return await this.ratings.save(rating);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('Ya calificaste este viaje');
      }
      throw err;
    }
  }
}
