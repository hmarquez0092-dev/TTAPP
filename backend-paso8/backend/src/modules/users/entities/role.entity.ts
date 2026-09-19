import { Column, Entity, ManyToMany, JoinTable, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from './permission.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // 'PASSENGER','DRIVER','OPERATOR','ADMIN','FINANCE'...

  @Column()
  name: string;

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
