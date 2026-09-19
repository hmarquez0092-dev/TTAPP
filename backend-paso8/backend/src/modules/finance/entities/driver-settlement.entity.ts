import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { User } from '../../users/entities/user.entity';

// Acumula la deuda de comision de un conductor por periodo (ej. semanal).
// totalCommission = lo que el conductor debe pagarle a la empresa en ese
// periodo, no lo que la empresa le paga a el.
@Entity('driver_settlements')
export class DriverSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DriverProfile)
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'total_earnings', type: 'numeric', precision: 10, scale: 2 })
  totalEarnings: number; // informativo: total cobrado por el conductor en el periodo

  @Column({ name: 'total_commission', type: 'numeric', precision: 10, scale: 2 })
  totalCommission: number; // deuda total del conductor con la empresa

  @Column({ default: 'OPEN' })
  status: string; // OPEN, RECONCILED, PAID

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reconciled_by' })
  reconciledBy: User | null;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt: Date | null;
}
