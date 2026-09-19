import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CoordinatesDto } from './coordinates.dto';

export class FareQuoteDto {
  @ValidateNested()
  @Type(() => CoordinatesDto)
  origin: CoordinatesDto;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  destination: CoordinatesDto;
}
