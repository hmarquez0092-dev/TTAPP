import { IsString } from 'class-validator';

export class StartTripDto {
  @IsString()
  securityCode: string;
}
