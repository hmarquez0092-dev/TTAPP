import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverLocation } from './entities/driver-location.entity';
import { DriverLocationHistory } from './entities/driver-location-history.entity';
import { GpsController } from './gps.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DriverLocation, DriverLocationHistory])],
  controllers: [GpsController],
  exports: [TypeOrmModule],
})
export class GpsModule {}
