import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ServiceCategory, TripStatus } from '../../../common/enums';
import { GeoPoint } from '../../../common/types/geo.types';
import { Organization } from '../../users/entities/organization.entity';
import { PassengerProfile } from '../../passengers/entities/passenger-profile.entity';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { FareRule } from '../../fares/entities/fare-rule.entity';
import { User } from '../../users/entities/user.entity';

// Nucleo del sistema. serviceCategory decide el flujo completo:
// NORMAL/NOCTURNO -> cotizacion + despacho automaticos.
// FORANEO -> arranca en PENDING_REVIEW, cotizacion y asignacion 100% manuales
// (ver docs/01-fundamentos-tecnicos.md 2.5 y api/openapi.yaml).
@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => PassengerProfile)
  @JoinColumn({ name: 'passenger_id' })
  passenger: PassengerProfile;

  @ManyToOne(() => DriverProfile, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile | null;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  @ManyToOne(() => FareRule, { nullable: true })
  @JoinColumn({ name: 'fare_rule_id' })
  fareRule: FareRule | null;

  @Column({ name: 'service_category', type: 'enum', enum: ServiceCategory, default: ServiceCategory.NORMAL })
  serviceCategory: ServiceCategory;

  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.REQUESTED })
  status: TripStatus;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  origin: GeoPoint;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  destination: GeoPoint;

  @Column({ name: 'quoted_fare', type: 'numeric', precision: 10, scale: 2, nullable: true })
  quotedFare: number | null;

  // Operador que autorizo la tarifa manual (solo FORANEO); null = cotizacion automatica
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'quoted_by' })
  quotedBy: User | null;

  @Column({ name: 'final_fare', type: 'numeric', precision: 10, scale: 2, nullable: true })
  finalFare: number | null;

  @Column({ name: 'distance_km', type: 'numeric', precision: 8, scale: 2, nullable: true })
  distanceKm: number | null;

  @Column({ name: 'duration_min', type: 'numeric', precision: 8, scale: 2, nullable: true })
  durationMin: number | null;

  @Column({ name: 'security_code', type: 'varchar', nullable: true })
  securityCode: string | null;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', nullable: true })
  cancellationReason: string | null;
}
