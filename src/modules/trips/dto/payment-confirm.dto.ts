import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PaymentConfirmDto {
  @IsIn(['CASH', 'CARD_TERMINAL'])
  method: 'CASH' | 'CARD_TERMINAL';

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  referenceNumber?: string;
}
