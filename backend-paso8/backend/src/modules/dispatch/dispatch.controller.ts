import { Body, Controller, ConflictException, Get, Param, Post } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { ManualAssignDto } from './dto/manual-assign.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { toTripResponse } from '../trips/mappers/trip.mapper';
import { InjectRepository } from '@nestjs/typeorm';
import { Trip } from '../trips/entities/trip.entity';
import { Repository } from 'typeorm';

@Controller()
export class DispatchController {
  constructor(
    private readonly dispatchService: DispatchService,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
  ) {}

  @RequirePermissions('trips.manage')
  @Post('trips/:tripId/dispatch/start')
  async start(@Param('tripId') tripId: string) {
    const trip = await this.trips.findOneOrFail({ where: { id: tripId } });
    if (trip.serviceCategory === 'FORANEO') {
      throw new ConflictException('FORANEO no admite despacho automatico');
    }
    const updated = await this.dispatchService.startDispatch(tripId);
    return toTripResponse(updated);
  }

  @Get('dispatch/offers/pending')
  async pendingOffers(@CurrentUser() user: AuthenticatedUser) {
    const offers = await this.dispatchService.getPendingOffersForDriver(user.id);
    return offers.map((o) => ({
      offerId: o.id,
      tripId: o.trip.id,
      score: o.score,
      offeredAt: o.offeredAt,
      trip: toTripResponse(o.trip),
    }));
  }

  @Get('trips/:tripId/dispatch/candidates')
  async candidates(@Param('tripId') tripId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dispatchService.getRankedCandidates(tripId, user.organizationId);
  }

  @Post('dispatch/offers/:offerId/respond')
  async respond(
    @Param('offerId') offerId: string,
    @Body() dto: RespondOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const trip = await this.dispatchService.respondToOffer(offerId, dto.response, user);
    return toTripResponse(trip);
  }

  @RequirePermissions('dispatch.manual_assign')
  @Post('dispatch/manual-assign')
  async manualAssign(@Body() dto: ManualAssignDto, @CurrentUser() user: AuthenticatedUser) {
    const trip = await this.dispatchService.manualAssign(dto, user);
    return toTripResponse(trip);
  }
}
