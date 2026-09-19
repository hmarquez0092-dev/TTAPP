import { IsIn, IsString } from 'class-validator';

export class CancelTripDto {
  @IsIn(['PASSENGER', 'DRIVER', 'SYSTEM'])
  cancelledBy: 'PASSENGER' | 'DRIVER' | 'SYSTEM';

  @IsString()
  reason: string;
}
