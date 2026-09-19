import { IsString, IsUUID } from 'class-validator';

export class ManualAssignDto {
  @IsUUID()
  tripId: string;

  @IsUUID()
  driverId: string;

  // Obligatorio por auditoria — regla de oro, seccion 117 Parte I.
  @IsString()
  reason: string;
}
