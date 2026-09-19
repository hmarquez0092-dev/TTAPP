import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { DriverStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('driver_profiles')
export class DriverProfile {
  // user_id es PK y FK a la vez: el conductor "extiende" a users, no
  // duplica su propia tabla de login (docs/01-fundamentos-tecnicos.md)
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'license_number' })
  licenseNumber: string;

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.OFFLINE })
  status: DriverStatus;

  @Column({ name: 'average_rating', type: 'numeric', precision: 3, scale: 2, default: 5.0 })
  averageRating: number;

  // Clave para el score de "justicia en la asignacion" (Parte I, seccion 25)
  @Column({ name: 'available_since', type: 'timestamptz', nullable: true })
  availableSince: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
