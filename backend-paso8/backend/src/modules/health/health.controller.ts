import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

// Prueba real, no un simple "ok" fijo: consulta la base de datos y
// confirma que la extension PostGIS esta activa. Si esto responde 200,
// el esqueleto completo (app + Postgres + PostGIS) esta funcionando.
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    const [{ now }] = await this.dataSource.query('SELECT now()');
    const [{ postgis_version }] = await this.dataSource.query('SELECT postgis_version()');
    return {
      status: 'ok',
      database: 'connected',
      serverTime: now,
      postgis: postgis_version,
    };
  }
}
