import { Injectable } from '@nestjs/common';
import { GeoPoint } from '../../common/types/geo.types';
import { DistanceEstimate, DistanceEstimationProvider } from './distance-estimation.provider';

// Placeholder hasta integrar Google Distance Matrix (ver Parte V del
// documento maestro). Formula de Haversine + factor de correccion vial.
@Injectable()
export class HaversineDistanceProvider implements DistanceEstimationProvider {
  private static readonly ROAD_FACTOR = 1.35; // ruta real vs linea recta
  private static readonly AVERAGE_SPEED_KMH = 25; // velocidad urbana promedio

  async estimate(origin: GeoPoint, destination: GeoPoint): Promise<DistanceEstimate> {
    const R = 6371;
    const [lng1, lat1] = origin.coordinates;
    const [lng2, lat2] = destination.coordinates;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLineKm = R * c;

    const distanceKm = straightLineKm * HaversineDistanceProvider.ROAD_FACTOR;
    const durationMin = (distanceKm / HaversineDistanceProvider.AVERAGE_SPEED_KMH) * 60;

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMin: Math.round(durationMin),
    };
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
