import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceZone } from './entities/service-zone.entity';
import { FareRule } from './entities/fare-rule.entity';
import { FareSchedule } from './entities/fare-schedule.entity';
import { FareCalculationService } from './fare-calculation.service';
import { FaresController } from './fares.controller';
import { DISTANCE_ESTIMATION_PROVIDER } from './distance-estimation.provider';
import { HaversineDistanceProvider } from './haversine-distance.provider';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceZone, FareRule, FareSchedule])],
  controllers: [FaresController],
  providers: [
    FareCalculationService,
    { provide: DISTANCE_ESTIMATION_PROVIDER, useClass: HaversineDistanceProvider },
  ],
  exports: [TypeOrmModule, FareCalculationService],
})
export class FaresModule {}
