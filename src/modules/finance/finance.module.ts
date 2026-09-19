import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Commission } from './entities/commission.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Commission, DriverSettlement, SettlementPayment])],
  exports: [TypeOrmModule],
})
export class FinanceModule {}
