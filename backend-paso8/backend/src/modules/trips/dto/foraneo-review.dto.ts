import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ForaneoReviewDto {
  @IsNumber()
  @Min(0)
  quotedFare: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
