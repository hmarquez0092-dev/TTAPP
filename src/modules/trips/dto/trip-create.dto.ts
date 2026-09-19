import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CoordinatesDto } from '../../fares/dto/coordinates.dto';

export class TripCreateDto {
  // Se ignora si el rol del solicitante es PASSENGER (ver TripsService.create):
  // siempre se usa el id del usuario autenticado. Solo OPERATOR/ADMIN pueden
  // usar este campo para crear un viaje a nombre de otro pasajero.
  @IsOptional()
  @IsUUID()
  passengerId?: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  origin: CoordinatesDto;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  destination: CoordinatesDto;
}
