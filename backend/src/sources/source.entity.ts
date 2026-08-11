import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Photo } from '../photos/photo.entity';

export type SourceType = 'local' | 'smb';
export type SourceStatus = 'idle' | 'queued' | 'scanning' | 'error';

@Entity()
export class Source {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  type: SourceType;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  localPath: string | null;

  @Column({ type: 'text', nullable: true })
  smbHost: string | null;

  @Column({ type: 'text', nullable: true })
  smbShare: string | null;

  @Column({ type: 'text', nullable: true })
  smbUsername: string | null;

  @Column({ type: 'text', nullable: true })
  smbPasswordEnc: string | null;

  @Column({ type: 'text', nullable: true })
  smbDomain: string | null;

  @Column({ type: 'text', nullable: true })
  smbRootPath: string | null;

  @Column({ type: 'text', default: 'idle' })
  status: SourceStatus;

  @Column({ type: 'text', nullable: true })
  lastScanError: string | null;

  /**
   * If true, this source's photos are excluded from the slideshow and it's
   * skipped by the automatic rescan schedule — without deleting it or its
   * already-scanned photos. Manual rescan/delete remain unaffected.
   */
  @Column({ type: 'boolean', default: false })
  paused: boolean;

  @Index('IDX_source_created_at')
  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Photo, (photo) => photo.source)
  photos: Photo[];
}
