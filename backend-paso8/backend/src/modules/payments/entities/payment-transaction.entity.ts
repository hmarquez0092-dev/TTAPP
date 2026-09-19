import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Payment } from './payment.entity';

// Solo aplica al metodo DIGITAL_INAPP (pasarela dentro de la app).
// Fuera de alcance del piloto, se conserva para no bloquear esa opcion a
// futuro. CASH y CARD_TERMINAL no generan fila aqui.
@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Payment)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column()
  provider: string; // 'stripe','mercadopago','openpay'

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ name: 'idempotency_key', unique: true })
  idempotencyKey: string;

  @Column()
  status: string;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
