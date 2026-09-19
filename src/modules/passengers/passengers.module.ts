import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassengerProfile } from './entities/passenger-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PassengerProfile])],
  exports: [TypeOrmModule],
})
export class PassengersModule {}
