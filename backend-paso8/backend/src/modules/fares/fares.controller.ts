import { Body, Controller, Post } from '@nestjs/common';
import { FareCalculationService } from './fare-calculation.service';
import { FareQuoteDto } from './dto/fare-quote.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { toGeoPoint } from '../../common/types/geo.util';

@Controller('fares')
export class FaresController {
  constructor(private readonly fareCalculationService: FareCalculationService) {}

  @Post('quote')
  quote(@Body() dto: FareQuoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fareCalculationService.quote(
      toGeoPoint(dto.origin),
      toGeoPoint(dto.destination),
      user.organizationId,
    );
  }
}
