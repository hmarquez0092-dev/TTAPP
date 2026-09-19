import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { GeoPoint } from '../../../common/types/geo.types';

// Ultima posicion conocida (se sobrescribe). Frecuencia por defecto 5s,
// configurable via la tabla `configuration` (clave gps.interval_seconds) -
// nunca hardcodeada en la app del conductor (docs/01-fundamentos-tecnicos.md 2.2).
@Entity('driver_locations')
export class DriverLocation {
  @PrimaryColumn('uuid', { name: 'driver_id' })
  driverId: string;

  @OneToOne(() => DriverProfile)
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  position: GeoPoint;

  @Column({ name: 'speed_kmh', type: 'numeric', precision: 5, scale: 2, nullable: true })
  speedKmh: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  heading: number | null;

  @Column({ name: 'accuracy_m', type: 'numeric', precision: 6, scale: 2, nullable: true })
  accuracyM: number | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
