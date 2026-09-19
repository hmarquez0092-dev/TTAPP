import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../users/entities/organization.entity';
import { GeoPolygon } from '../../../common/types/geo.types';

// Colonias/zonas para tarifas diferenciadas. Cargar una colonia nueva es
// insertar una fila aqui + sus fare_rules; no requiere tocar el esquema
// (docs/01-fundamentos-tecnicos.md 2.5).
@Entity('service_zones')
export class ServiceZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column()
  name: string;

  @Column({ type: 'geography', spatialFeatureType: 'Polygon', srid: 4326 })
  area: GeoPolygon;

  @Column({ default: true })
  active: boolean;
}
