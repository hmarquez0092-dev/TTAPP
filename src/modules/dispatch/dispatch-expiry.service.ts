import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { TripAssignmentOffer } from '../trips/entities/trip-assignment-offer.entity';
import { DispatchService } from './dispatch.service';

const DEFAULT_TIMEOUT_SECONDS = 20;

@Injectable()
export class DispatchExpiryService {
  private readonly logger = new Logger(DispatchExpiryService.name);

  constructor(
    @InjectRepository(TripAssignmentOffer) private readonly offers: Repository<TripAssignmentOffer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dispatchService: DispatchService,
  ) {}

  @Cron('*/5 * * * * *') // cada 5 segundos
  async expireStaleOffers(): Promise<void> {
    const pending = await this.offers.find({
      where: { respondedAt: IsNull(), manual: false },
      relations: ['trip', 'trip.organization'],
    });

    for (const offer of pending) {
      const timeoutRows = await this.dataSource.query(
        `SELECT value FROM configuration WHERE organization_id = $1 AND key = 'dispatch.offer_timeout_seconds' LIMIT 1`,
        [offer.trip.organization.id],
      );
      const timeoutSeconds =
        timeoutRows.length > 0 ? Number(timeoutRows[0].value) : DEFAULT_TIMEOUT_SECONDS;

      const elapsedSeconds = (Date.now() - new Date(offer.offeredAt).getTime()) / 1000;
      if (elapsedSeconds > timeoutSeconds) {
        this.logger.log(`Oferta ${offer.id} expiro (${Math.round(elapsedSeconds)}s) — reintentando`);
        await this.dispatchService.expireOffer(offer.id);
      }
    }
  }
}
