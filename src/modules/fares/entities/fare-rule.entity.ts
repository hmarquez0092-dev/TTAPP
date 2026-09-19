import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ServiceCategory } from '../../../common/enums';
import { Organization } from '../../users/entities/organization.entity';
import { ServiceZone } from './service-zone.entity';
import { User } from '../../users/entities/user.entity';

// Una fila por (categoria, zona, vigencia). zone_id NULL = tarifa por
// defecto de la categoria. REGLA DE NEGOCIO: nunca se hace UPDATE sobre
// una fila PUBLISHED; un cambio de tarifa siempre inserta una version
// nueva y cierra la anterior (valid_to = now()).
@Entity('fare_rules')
export class FareRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'service_category', type: 'enum', enum: ServiceCategory })
  serviceCategory: ServiceCategory;

  @ManyToOne(() => ServiceZone, { nullable: true })
  @JoinColumn({ name: 'zone_id' })
  zone: ServiceZone | null;

  @Column()
  name: string;

  @Column()
  version: number;

  @Column({ name: 'base_fare', type: 'numeric', precision: 10, scale: 2 })
  baseFare: number;

  @Column({ name: 'cost_per_km', type: 'numeric', precision: 10, scale: 2 })
  costPerKm: number;

  @Column({ name: 'cost_per_minute', type: 'numeric', precision: 10, scale: 2 })
  costPerMinute: number;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ default: 'DRAFT' })
  status: string; // DRAFT, PUBLISHED, ARCHIVED

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'published_by' })
  publishedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
