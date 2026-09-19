import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleDocument } from './entities/vehicle-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, VehicleDocument])],
  exports: [TypeOrmModule],
})
export class VehiclesModule {}
