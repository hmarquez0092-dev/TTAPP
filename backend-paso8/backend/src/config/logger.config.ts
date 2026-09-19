import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

// Salida JSON estructurada: permite buscar/filtrar por tripId, driverId,
// nivel, etc. en vez de grep sobre texto libre — necesario para operar
// el piloto (docs/03-especificacion-paso8.md, seccion 2.5).
export const winstonLogger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
    }),
  ],
});
