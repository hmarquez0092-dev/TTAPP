import { IsIn } from 'class-validator';

export class RespondOfferDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  response: 'ACCEPTED' | 'REJECTED';
}
