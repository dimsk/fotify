import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CollageLayoutType } from '../settings/settings.entity';

export type QueuedSlideType = 'single' | 'triple' | 'collage';

/**
 * Persists the server's lookahead slide buffer so the slideshow resumes in
 * the same order after a restart instead of re-randomizing. Rows are
 * inserted in the order they're queued and deleted once consumed (or
 * purged if a referenced photo is deleted) — the id order (== insertion
 * order) is what restores the FIFO ordering on boot.
 *
 * photoIds holds every photo in the slide, in cell order (length 1 for
 * single, 3 for triple, 2-6 for collage) — a simple-array column rather
 * than a join table, since this buffer is capped at LOOKAHEAD_DEPTH rows,
 * is purely ephemeral (fully rebuilt shortly after every boot), and is
 * never queried relationally.
 */
@Entity()
export class QueuedSlide {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  type: QueuedSlideType;

  @Column({ type: 'simple-array' })
  photoIds: number[];

  /** Which of the 10 named collage layouts this slide uses — null for single/triple. */
  @Column({ type: 'varchar', nullable: true })
  layout: CollageLayoutType | null;

  @CreateDateColumn()
  createdAt: Date;
}
