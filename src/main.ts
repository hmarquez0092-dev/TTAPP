import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { winstonLogger } from './config/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: winstonLogger });

  // whitelist: rechaza campos no declarados en los DTOs — primera linea
  // de defensa contra payloads inesperados desde las apps moviles.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Ningun error no controlado sale con stack trace al cliente
  // (docs/03-especificacion-paso8.md, seccion 2.4)
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Backend del piloto escuchando en :${port} (${process.env.NODE_ENV})`, 'Bootstrap');
}
bootstrap();
