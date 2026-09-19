import { ServiceCategory } from '../../common/enums';

export interface ServiceCategoryResult {
  category: ServiceCategory;
  zoneId: string | null;
}

export interface FareQuoteResult {
  serviceCategory: ServiceCategory;
  estimatedFare: number | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMin: number | null;
  fareRuleId: string | null;
  zoneId: string | null;
}

interface FareScheduleRow {
  manual_override: string | null;
  start_time: string;
  end_time: string;
}
export type { FareScheduleRow };
