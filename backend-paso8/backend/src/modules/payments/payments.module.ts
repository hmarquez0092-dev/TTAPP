import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentTransaction])],
  exports: [TypeOrmModule],
})
export class PaymentsModule {}
