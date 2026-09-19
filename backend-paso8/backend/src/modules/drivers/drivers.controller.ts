import { Body, Controller, ForbiddenException, Param, Patch } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverProfile } from './entities/driver-profile.entity';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { DriverStatus } from '../../common/enums';

@Controller('drivers')
export class DriversController {
  constructor(@InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>) {}

  @Patch(':driverId/status')
  async updateStatus(
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Solo el propio conductor o un ADMIN puede cambiar este estado.
    if (driverId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('No puedes cambiar el estado de otro conductor');
    }

    const driver = await this.drivers.findOneOrFail({ where: { userId: driverId } });

    // Regla critica para la equidad del score de despacho (Ticket 7.12,
    // docs/02-especificacion-paso7.md): solo se resetea el reloj de
    // disponibilidad al ENTRAR a AVAILABLE, no en cualquier otra transicion.
    const becomingAvailable = dto.status === DriverStatus.AVAILABLE && driver.status !== DriverStatus.AVAILABLE;

    driver.status = dto.status;
    if (becomingAvailable) {
      driver.availableSince = new Date();
    }
    await this.drivers.save(driver);

    return { driverId, status: driver.status };
  }
}
