import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './modules/audit/audit.interceptor';

import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PassengersModule } from './modules/passengers/passengers.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { GpsModule } from './modules/gps/gps.module';
import { FaresModule } from './modules/fares/fares.module';
import { TripsModule } from './modules/trips/trips.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FinanceModule } from './modules/finance/finance.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';

@Module({
  imports: [
    // envFilePath resuelto por NODE_ENV: cada ambiente (development, test,
    // staging, production) tiene su propio archivo — ver .env.example
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      validate,
    }),
    DatabaseModule,
    RedisModule,
    AuditModule, // global — cualquier modulo puede inyectar AuditService
    EventEmitterModule.forRoot(), // TripsService -> 'trip.quoted' -> DispatchService (evita ciclo de modulos)
    ScheduleModule.forRoot(), // cron de expiracion de ofertas (DispatchExpiryService)
    // 5 intentos por minuto por IP+ruta — sobre todo para /auth/login
    // (fuerza bruta). docs/03-especificacion-paso8.md, seccion 2.1.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),

    // Modulos de dominio, en el mismo orden del alcance congelado
    // (docs/01-fundamentos-tecnicos.md, Paso 1)
    AuthModule,
    UsersModule,
    PassengersModule,
    DriversModule,
    VehiclesModule,
    GpsModule,
    FaresModule,
    TripsModule,
    DispatchModule,
    PaymentsModule,
    FinanceModule,
    RatingsModule,
    NotificationsModule,
    ConfigurationModule,

    HealthModule,
  ],
  providers: [
    // Orden importa: primero autentica (JWT), despues autoriza (permisos).
    // "Seguro por diseno": toda ruta requiere JWT + esta libre de
    // restriccion de permiso salvo que @RequirePermissions() diga lo
    // contrario. @Public() es la unica forma de saltarse el primero.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registra automaticamente cada escritura HTTP como red de
    // seguridad de linea base (ver audit.interceptor.ts).
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
