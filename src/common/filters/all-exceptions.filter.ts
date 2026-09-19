import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

// Sin esto, un error no controlado (bug, timeout de la base, lo que sea)
// devuelve el stack trace completo al cliente — inaceptable en cuanto
// hay usuarios reales. docs/03-especificacion-paso8.md, seccion 2.4.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Error interno';

    if (status === 500) {
      // El stack completo SOLO va al log del servidor, nunca a la respuesta.
      this.logger.error(
        `${request?.method} ${request?.url} -> 500`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url,
    });
  }
}
