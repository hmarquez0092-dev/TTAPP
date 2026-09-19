import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TripStatus } from '../../../common/enums';

export class ListTripsQueryDto {
  // Acepta ?status=A&status=B (array) o ?status=A (string suelto) —
  // se normaliza siempre a array antes de validar.
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsEnum(TripStatus, { each: true })
  status?: TripStatus[];

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  passengerId?: string;
}
