import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';

// Una calificacion por viaje por usuario (RAT-002) — se aplica con un
// UNIQUE(trip_id, rated_by) en la base, no solo a nivel aplicacion.
@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Trip)
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'rated_by' })
  ratedBy: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'rated_user' })
  ratedUser: User;

  @Column({ type: 'smallint' })
  score: number;

  @Column({ type: 'varchar', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
