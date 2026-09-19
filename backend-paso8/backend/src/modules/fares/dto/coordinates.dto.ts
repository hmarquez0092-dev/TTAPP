import { IsLatitude, IsLongitude } from 'class-validator';

// Formato "humano" (lat/lng) que reciben los DTOs desde el cliente.
// Se convierte a GeoPoint ({type:'Point', coordinates:[lng,lat]}) justo
// antes de tocar la base — ver toGeoPoint() en geo.util.ts.
export class CoordinatesDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
