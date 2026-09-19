import { GeoPoint } from '../../common/types/geo.types';

export interface DistanceEstimate {
  distanceKm: number;
  durationMin: number;
}

export const DISTANCE_ESTIMATION_PROVIDER = 'DISTANCE_ESTIMATION_PROVIDER';

// Interfaz swappable: HaversineDistanceProvider es el placeholder del
// piloto (Ticket 7.1). El dia que haya API key de Google Distance Matrix
// se agrega GoogleDistanceMatrixProvider implementando esta misma
// interfaz y se cambia el useClass en fares.module.ts — nada mas.
export interface DistanceEstimationProvider {
  estimate(origin: GeoPoint, destination: GeoPoint): Promise<DistanceEstimate>;
}
