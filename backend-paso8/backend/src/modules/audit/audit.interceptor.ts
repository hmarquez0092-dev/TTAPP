import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REDACTED_FIELDS = new Set(['password', 'passwordHash', 'password_hash']);

function sanitize(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (REDACTED_FIELDS.has(key)) clone[key] = '[REDACTED]';
  }
  return clone;
}

// Red de seguridad de linea base: registra TODA escritura HTTP
// automaticamente (metodo, ruta, quien, IP, body saneado), incluso si el
// desarrollador de un modulo se olvido de llamar a AuditService.record()
// con el detalle de negocio. No reemplaza esas llamadas explicitas
// (que traen old_value/new_value reales) — las complementa.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        void this.auditService.record({
          actorUserId: request.user?.id ?? null,
          action: `HTTP ${request.method}`,
          entity: 'http_request',
          entityId: request.route?.path ?? request.url,
          newValue: sanitize(request.body),
          ipAddress: request.ip ?? null,
        });
      }),
    );
  }
}
