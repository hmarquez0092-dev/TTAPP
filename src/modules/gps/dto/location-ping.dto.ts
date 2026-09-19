import { IsDateString, IsLatitude, IsLongitude, IsNumber, IsOptional } from 'class-validator';

export class LocationPingDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  speedKmh?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @IsDateString()
  recordedAt: string;
}
