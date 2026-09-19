import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Trip } from './trip.entity';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { User } from '../../users/entities/user.entity';

// Ofertas de despacho hechas a cada conductor candidato (DSP-004).
// manual=true + assignedBy = flujo de /dispatch/manual-assign (unico
// camino posible para FORANEO, excepcion manual para NORMAL/NOCTURNO).
@Entity('trip_assignment_offers')
export class TripAssignmentOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @ManyToOne(() => DriverProfile)
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ type: 'numeric', precision: 6, scale: 4, nullable: true })
  score: number | null;

  @CreateDateColumn({ name: 'offered_at' })
  offeredAt: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  response: string | null; // 'ACCEPTED','REJECTED','EXPIRED'

  @Column({ default: false })
  manual: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assignedBy: User | null;
}
