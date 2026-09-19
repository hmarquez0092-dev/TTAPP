import { IsIn } from 'class-validator';
import { DriverStatus } from '../../../common/enums';

export class UpdateDriverStatusDto {
  @IsIn(Object.values(DriverStatus))
  status: DriverStatus;
}
