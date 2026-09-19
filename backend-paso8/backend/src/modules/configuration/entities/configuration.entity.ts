import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../users/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

// Parametros configurables sin publicar codigo nuevo. Ejemplos ya
// definidos: gps.interval_seconds, dispatch.weights (docs/01-fundamentos-tecnicos.md)
@Entity('configuration')
export class Configuration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column()
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
