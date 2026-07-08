import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Photo } from './photo.entity';

@Entity()
export class PhotoAction {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_photo_action_photo_id', { unique: true })
  @Column({ type: 'int' })
  photoId: number;

  @OneToOne(() => Photo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'photoId' })
  photo: Photo;

  @Column({ type: 'datetime', nullable: true })
  favoritedAt: Date | null;

  @Index('IDX_photo_action_hidden_at')
  @Column({ type: 'datetime', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'int', default: 0 })
  downloadCount: number;

  @Column({ type: 'datetime', nullable: true })
  lastDownloadedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
