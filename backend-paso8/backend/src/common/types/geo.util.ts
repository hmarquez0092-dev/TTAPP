import { GeoPoint } from './geo.types';

export interface LatLng {
  lat: number;
  lng: number;
}

// Convierte el formato "humano" {lat, lng} que reciben los DTOs al
// formato GeoJSON verificado que espera TypeORM en las columnas
// geography (ver seccion 0 de docs/02-especificacion-paso7.md).
export function toGeoPoint(coords: LatLng): GeoPoint {
  return { type: 'Point', coordinates: [coords.lng, coords.lat] };
}

// Inverso, para devolver coordenadas al cliente en el formato del OpenAPI.
export function fromGeoPoint(point: GeoPoint): LatLng {
  return { lng: point.coordinates[0], lat: point.coordinates[1] };
}
