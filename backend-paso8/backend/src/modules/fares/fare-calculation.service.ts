import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ServiceCategory } from '../../common/enums';
import { GeoPoint } from '../../common/types/geo.types';
import {
  DISTANCE_ESTIMATION_PROVIDER,
  DistanceEstimationProvider,
} from './distance-estimation.provider';
import { FareQuoteResult, FareScheduleRow, ServiceCategoryResult } from './fare-calculation.types';
import { round2 } from '../trips/trip-state.util';

// Ticket 7.2 de docs/02-especificacion-paso7.md
@Injectable()
export class FareCalculationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(DISTANCE_ESTIMATION_PROVIDER)
    private readonly distanceProvider: DistanceEstimationProvider,
  ) {}

  async determineServiceCategory(
    origin: GeoPoint,
    organizationId: string,
  ): Promise<ServiceCategoryResult> {
    const zoneRows = await this.dataSource.query(
      `SELECT id FROM service_zones
       WHERE organization_id = $1 AND active = true
         AND ST_Contains(area::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326))
       LIMIT 1`,
      [organizationId, origin.coordinates[0], origin.coordinates[1]],
    );

    if (zoneRows.length === 0) {
      return { category: ServiceCategory.FORANEO, zoneId: null };
    }
    const zoneId = zoneRows[0].id;

    const schedules: FareScheduleRow[] = await this.dataSource.query(
      `SELECT manual_override, start_time, end_time FROM fare_schedules
       WHERE organization_id = $1 AND service_category = 'NOCTURNO' AND active = true`,
      [organizationId],
    );

    const isNocturno = this.evaluateNocturnoSchedules(schedules);
    return { category: isNocturno ? ServiceCategory.NOCTURNO : ServiceCategory.NORMAL, zoneId };
  }

  // OJO al cruce de medianoche: 22:00-06:00 significa
  // "hora actual >= 22:00 O hora actual < 06:00", no un rango directo.
  private evaluateNocturnoSchedules(schedules: FareScheduleRow[]): boolean {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const s of schedules) {
      if (s.manual_override === 'FORCE_ON') return true;
      if (s.manual_override === 'FORCE_OFF') return false;

      const [startH, startM] = s.start_time.split(':').map(Number);
      const [endH, endM] = s.end_time.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      const withinWindow =
        startMinutes > endMinutes
          ? currentMinutes >= startMinutes || currentMinutes < endMinutes
          : currentMinutes >= startMinutes && currentMinutes < endMinutes;

      if (withinWindow) return true;
    }
    return false;
  }

  async quote(
    origin: GeoPoint,
    destination: GeoPoint,
    organizationId: string,
  ): Promise<FareQuoteResult> {
    const { category, zoneId } = await this.determineServiceCategory(origin, organizationId);

    if (category === ServiceCategory.FORANEO) {
      return {
        serviceCategory: category,
        estimatedFare: null,
        estimatedDistanceKm: null,
        estimatedDurationMin: null,
        fareRuleId: null,
        zoneId: null,
      };
    }

    const distance = await this.distanceProvider.estimate(origin, destination);

    const fareRuleRows = await this.dataSource.query(
      `SELECT * FROM fare_rules
       WHERE organization_id = $1 AND service_category = $2 AND status = 'PUBLISHED'
         AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
         AND (zone_id = $3 OR zone_id IS NULL)
       ORDER BY zone_id NULLS LAST
       LIMIT 1`,
      [organizationId, category, zoneId],
    );

    if (fareRuleRows.length === 0) {
      throw new UnprocessableEntityException(
        'No hay tarifa publicada para esta categoria y zona',
      );
    }
    const fareRule = fareRuleRows[0];

    const fare =
      Number(fareRule.base_fare) +
      Number(fareRule.cost_per_km) * distance.distanceKm +
      Number(fareRule.cost_per_minute) * distance.durationMin;

    return {
      serviceCategory: category,
      estimatedFare: round2(fare),
      estimatedDistanceKm: distance.distanceKm,
      estimatedDurationMin: distance.durationMin,
      fareRuleId: fareRule.id,
      zoneId,
    };
  }
}
