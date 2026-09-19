import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverVehicleAssignment } from './entities/driver-vehicle-assignment.entity';
import { DriverShift } from './entities/driver-shift.entity';
import { DriversController } from './drivers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverProfile, DriverDocument, DriverVehicleAssignment, DriverShift]),
  ],
  controllers: [DriversController],
  exports: [TypeOrmModule],
})
export class DriversModule {}
