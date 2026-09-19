import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DriverProfile } from './driver-profile.entity';

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DriverProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ name: 'doc_type' })
  docType: string; // 'LICENSE','ID','BACKGROUND_CHECK'...

  @Column({ name: 'file_url' })
  fileUrl: string;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt: string | null;

  @Column({ default: false })
  verified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
