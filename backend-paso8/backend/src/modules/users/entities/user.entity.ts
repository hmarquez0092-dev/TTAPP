import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserStatus } from '../../../common/enums';
import { Organization } from './organization.entity';
import { Branch } from './branch.entity';
import { Role } from './role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
