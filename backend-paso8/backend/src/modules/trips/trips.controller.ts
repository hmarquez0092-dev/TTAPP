import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripCreateDto } from './dto/trip-create.dto';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { ForaneoReviewDto } from './dto/foraneo-review.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { PaymentConfirmDto } from './dto/payment-confirm.dto';
import { RatingDto } from './dto/rating.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { toTripResponse } from './mappers/trip.mapper';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  async create(@Body() dto: TripCreateDto, @CurrentUser() user: AuthenticatedUser) {
    const trip = await this.tripsService.create(dto, user);
    return toTripResponse(trip);
  }

  @Get()
  async findAll(@Query() query: ListTripsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const trips = await this.tripsService.findAll(query, user);
    return trips.map(toTripResponse);
  }

  @Get(':tripId')
  async findOne(@Param('tripId') tripId: string) {
    const trip = await this.tripsService.findOne(tripId);
    return toTripResponse(trip);
  }

  @RequirePermissions('trips.review')
  @Post(':tripId/review')
  async review(
    @Param('tripId') tripId: string,
    @Body() dto: ForaneoReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const trip = await this.tripsService.review(tripId, dto, user);
    return toTripResponse(trip);
  }

  @Post(':tripId/arrive')
  async arrive(@Param('tripId') tripId: string, @CurrentUser() user: AuthenticatedUser) {
    const trip = await this.tripsService.arrive(tripId, user);
    return toTripResponse(trip);
  }

  @Post(':tripId/start')
  async start(
    @Param('tripId') tripId: string,
    @Body() dto: StartTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const trip = await this.tripsService.start(tripId, dto.securityCode, user);
    return toTripResponse(trip);
  }

  @Post(':tripId/complete')
  async complete(@Param('tripId') tripId: string, @CurrentUser() user: AuthenticatedUser) {
    const trip = await this.tripsService.complete(tripId, user);
    return toTripResponse(trip);
  }

  @Post(':tripId/payment')
  async payment(
    @Param('tripId') tripId: string,
    @Body() dto: PaymentConfirmDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.confirmPayment(tripId, dto, user);
  }

  @Post(':tripId/cancel')
  async cancel(
    @Param('tripId') tripId: string,
    @Body() dto: CancelTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const trip = await this.tripsService.cancel(tripId, dto, user);
    return toTripResponse(trip);
  }

  @Post(':tripId/rating')
  async rate(
    @Param('tripId') tripId: string,
    @Body() dto: RatingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.rate(tripId, dto, user);
  }
}
