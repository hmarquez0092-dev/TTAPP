import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DriverSettlement } from './driver-settlement.entity';
import { User } from '../../users/entities/user.entity';

// Rastro auditable de cada pago que el conductor hace a la empresa para
// saldar su deuda de comision (regla de oro, Parte I seccion 117: quien,
// cuanto, cuando, como). Puede haber varios pagos parciales por settlement.
@Entity('settlement_payments')
export class SettlementPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DriverSettlement)
  @JoinColumn({ name: 'settlement_id' })
  settlement: DriverSettlement;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: number;

  @Column()
  method: string; // 'CASH_DROP','TRANSFER','DEPOSIT_DEDUCTION'

  @Column({ name: 'reference_number', type: 'varchar', nullable: true })
  referenceNumber: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'received_by' })
  receivedBy: User | null; // operador/finanzas que recibio el pago

  @CreateDateColumn({ name: 'paid_at' })
  paidAt: Date;
}
