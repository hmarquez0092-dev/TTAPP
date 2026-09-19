import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('passenger_profiles')
export class PassengerProfile {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'average_rating', type: 'numeric', precision: 3, scale: 2, default: 5.0 })
  averageRating: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
