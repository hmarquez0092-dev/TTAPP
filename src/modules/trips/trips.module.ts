import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './entities/trip.entity';
import { TripEvent } from './entities/trip-event.entity';
import { TripAssignmentOffer } from './entities/trip-assignment-offer.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { FaresModule } from '../fares/fares.module';
import { DriversModule } from '../drivers/drivers.module';
import { GpsModule } from '../gps/gps.module';
import { PaymentsModule } from '../payments/payments.module';
import { FinanceModule } from '../finance/finance.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, TripEvent, TripAssignmentOffer]),
    FaresModule,
    DriversModule,
    GpsModule,
    PaymentsModule,
    FinanceModule,
    RatingsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TypeOrmModule, TripsService],
})
export class TripsModule {}
