import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { GeoPoint } from '../../../common/types/geo.types';

// Historico completo — usado para reconstruir distancia/duracion real al
// completar el viaje (ver TripsService) y para auditoria/reproduccion.
// Particionar por fecha queda diferido hasta que el volumen del piloto
// lo justifique (docs/01-fundamentos-tecnicos.md).
@Entity('driver_location_history')
export class DriverLocationHistory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => DriverProfile)
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  position: GeoPoint;

  @Column({ name: 'speed_kmh', type: 'numeric', precision: 5, scale: 2, nullable: true })
  speedKmh: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  heading: number | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
