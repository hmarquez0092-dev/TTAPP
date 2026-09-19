import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { DriversModule } from '../drivers/drivers.module';
import { GpsModule } from '../gps/gps.module';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';
import { DispatchExpiryService } from './dispatch-expiry.service';

// Sin entidades propias: opera sobre Trip/TripAssignmentOffer (de
// TripsModule) y DriverProfile/DriverLocation (de DriversModule/GpsModule).
@Module({
  imports: [TripsModule, DriversModule, GpsModule],
  controllers: [DispatchController],
  providers: [DispatchService, DispatchExpiryService],
})
export class DispatchModule {}
