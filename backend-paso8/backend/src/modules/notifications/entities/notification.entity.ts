import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'event_type' })
  eventType: string; // 'TRIP_ASSIGNED','DRIVER_ARRIVED','PAYMENT_CONFIRMED'...

  @Column()
  channel: string; // 'PUSH','SMS','EMAIL'

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
