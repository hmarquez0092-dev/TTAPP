import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditParams {
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
}

// Regla de oro (Parte I, seccion 117): quien, que, cuando, sobre que
// registro, valor anterior, valor nuevo, por que. Tabla append-only:
// ningun metodo de este servicio actualiza ni borra filas existentes.
//
// Uso tipico desde un servicio de negocio (ej. al publicar una tarifa,
// al asignar manualmente un conductor, al bloquear un usuario):
//
//   await this.auditService.record({
//     actorUserId: operator.id,
//     action: 'fare_rule.publish',
//     entity: 'fare_rules',
//     entityId: fareRule.id,
//     oldValue: { status: 'DRAFT' },
//     newValue: { status: 'PUBLISHED' },
//     reason: dto.reason,
//   });
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  async record(params: RecordAuditParams): Promise<void> {
    const log = this.logs.create({
      actorUser: params.actorUserId ? ({ id: params.actorUserId } as any) : null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      reason: params.reason ?? null,
      ipAddress: params.ipAddress ?? null,
    });
    await this.logs.save(log);
  }
}
