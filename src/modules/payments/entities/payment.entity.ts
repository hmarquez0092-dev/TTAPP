import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentMethod } from '../../../common/enums';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';

// El conductor cobra directo al pasajero (efectivo o su propia terminal
// bancaria); la plataforma no retiene ese dinero. Por eso la confirmacion
// es manual del conductor, no una notificacion automatica de una pasarela
// (docs/01-fundamentos-tecnicos.md 2.4).
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Trip)
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  // Folio de la terminal bancaria, si aplica — solo auditoria, no hay
  // conciliacion automatica posible sin integracion API con el banco.
  @Column({ name: 'reference_number', type: 'varchar', nullable: true })
  referenceNumber: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmed_by' })
  confirmedBy: User | null;

  @Column({ default: 'PENDING' })
  status: string; // PENDING, DRIVER_CONFIRMED, DISPUTED

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
