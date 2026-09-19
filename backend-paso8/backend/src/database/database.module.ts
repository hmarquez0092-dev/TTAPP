import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Fuente unica de verdad del esquema: db/schema.sql (aplicado por fuera de
// TypeORM). synchronize siempre en false: TypeORM nunca debe alterar
// tablas por su cuenta en este proyecto.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
