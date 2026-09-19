import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TripStatus } from '../../../common/enums';
import { GeoPoint } from '../../../common/types/geo.types';
import { Trip } from './trip.entity';
import { User } from '../../users/entities/user.entity';

// Bitacora INMUTABLE de transiciones de estado (nunca se edita ni se
// borra) - Parte I, secciones 21-22. Cada cambio de estado del viaje
// debe insertar una fila aqui, sin excepcion.
@Entity('trip_events')
export class TripEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'from_status', type: 'enum', enum: TripStatus, nullable: true })
  fromStatus: TripStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: TripStatus })
  toStatus: TripStatus;

  // NULL = la transicion la hizo el sistema, no una persona
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  position: GeoPoint | null;

  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;
}
