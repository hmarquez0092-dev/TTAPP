import { Trip } from '../entities/trip.entity';
import { fromGeoPoint } from '../../../common/types/geo.util';

// Aplana la entidad (con sus relaciones cargadas como objetos) a la forma
// plana que espera el cliente segun api/openapi.yaml (ids sueltos, no
// objetos anidados; coordenadas {lat,lng}, no GeoJSON).
export function toTripResponse(trip: Trip) {
  return {
    id: trip.id,
    passengerId: trip.passenger?.userId ?? (trip as any).passengerId ?? null,
    driverId: trip.driver?.userId ?? (trip as any).driverId ?? null,
    vehicleId: trip.vehicle?.id ?? (trip as any).vehicleId ?? null,
    serviceCategory: trip.serviceCategory,
    status: trip.status,
    origin: fromGeoPoint(trip.origin),
    destination: fromGeoPoint(trip.destination),
    quotedFare: trip.quotedFare,
    quotedBy: trip.quotedBy?.id ?? null,
    finalFare: trip.finalFare,
    distanceKm: trip.distanceKm,
    durationMin: trip.durationMin,
    requestedAt: trip.requestedAt,
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    cancellationReason: trip.cancellationReason,
  };
}
