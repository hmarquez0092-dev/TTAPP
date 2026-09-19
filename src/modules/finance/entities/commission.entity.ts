import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';

// Por viaje: lo que el conductor le debe a la empresa, NO un pago que la
// empresa le hace. Con CASH/CARD_TERMINAL el conductor ya se quedo con
// driverEarning al momento del viaje; commissionAmount es la deuda
// pendiente que se liquida despues via DriverSettlement.
@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Trip)
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'gross_amount', type: 'numeric', precision: 10, scale: 2 })
  grossAmount: number;

  @Column({ name: 'commission_pct', type: 'numeric', precision: 5, scale: 2 })
  commissionPct: number;

  @Column({ name: 'commission_amount', type: 'numeric', precision: 10, scale: 2 })
  commissionAmount: number; // deuda del conductor con la empresa por este viaje

  @Column({ name: 'driver_earning', type: 'numeric', precision: 10, scale: 2 })
  driverEarning: number; // lo que el conductor ya se quedo (gross - commission)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
