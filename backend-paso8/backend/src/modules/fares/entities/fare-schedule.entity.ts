import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ServiceCategory } from '../../../common/enums';
import { Organization } from '../../users/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

// Controla cuando se activa NOCTURNO: por horario (start/end) o forzado
// manualmente desde el centro de monitoreo (docs/01-fundamentos-tecnicos.md 2.5).
@Entity('fare_schedules')
export class FareSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'service_category', type: 'enum', enum: ServiceCategory })
  serviceCategory: ServiceCategory;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'manual_override', type: 'varchar', nullable: true })
  manualOverride: string | null; // NULL = automatico; 'FORCE_ON' / 'FORCE_OFF'

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'overridden_by' })
  overriddenBy: User | null;

  @Column({ name: 'overridden_at', type: 'timestamptz', nullable: true })
  overriddenAt: Date | null;

  @Column({ default: true })
  active: boolean;
}
