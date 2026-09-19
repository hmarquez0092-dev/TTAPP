import { Body, Controller, ForbiddenException, HttpCode, Param, Post } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DriverLocationHistory } from './entities/driver-location-history.entity';
import { LocationPingDto } from './dto/location-ping.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';

@Controller('drivers/:driverId/locations')
export class GpsController {
  constructor(
    @InjectRepository(DriverLocationHistory)
    private readonly history: Repository<DriverLocationHistory>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @HttpCode(204)
  async ping(
    @Param('driverId') driverId: string,
    @Body() dto: LocationPingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    // Solo el propio conductor puede reportar su posicion.
    if (driverId !== user.id) {
      throw new ForbiddenException('No puedes reportar la posicion de otro conductor');
    }

    const point = { type: 'Point', coordinates: [dto.lng, dto.lat] };

    // driver_locations: upsert (ultima posicion conocida)
    await this.dataSource.query(
      `INSERT INTO driver_locations (driver_id, position, speed_kmh, heading, accuracy_m, recorded_at)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, $4, $5, $6)
       ON CONFLICT (driver_id) DO UPDATE SET
         position = EXCLUDED.position,
         speed_kmh = EXCLUDED.speed_kmh,
         heading = EXCLUDED.heading,
         accuracy_m = EXCLUDED.accuracy_m,
         recorded_at = EXCLUDED.recorded_at`,
      [driverId, JSON.stringify(point), dto.speedKmh ?? null, dto.heading ?? null, dto.accuracyM ?? null, dto.recordedAt],
    );

    // driver_location_history: siempre INSERT, nunca se actualiza ni se
    // borra — es la fuente para calcular la distancia real al completar
    // el viaje (Ticket 7.16).
    await this.history.save(
      this.history.create({
        driver: { userId: driverId } as any,
        position: point as any,
        speedKmh: dto.speedKmh ?? null,
        heading: dto.heading ?? null,
        recordedAt: new Date(dto.recordedAt),
      }),
    );
  }
}
