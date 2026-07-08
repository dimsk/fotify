import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Calendar } from './calendar.entity';

/**
 * A cached copy of one event instance from a connected calendar, refreshed
 * periodically by CalendarSyncService — the kiosk-facing /calendar/today
 * endpoint only ever reads this table, never the provider APIs directly.
 */
@Entity()
@Index(['calendarId', 'externalId'], { unique: true })
export class CalendarEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  calendarId: number;

  @ManyToOne(() => Calendar, (calendar) => calendar.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'calendarId' })
  calendar: Calendar;

  /** Google event id, or CalDAV UID. */
  @Column({ type: 'text' })
  externalId: string;

  @Column({ type: 'text' })
  title: string;

  @Index()
  @Column({ type: 'datetime' })
  startAt: Date;

  @Column({ type: 'datetime' })
  endAt: Date;

  @Column({ type: 'boolean' })
  isAllDay: boolean;

  /**
   * Non-null hex color ⇒ this event carries its own per-event color override
   * in the source calendar (Google colorId, or CalDAV's COLOR property) and
   * is treated as "important" — rendered in this color instead of the
   * calendar's default. Null ⇒ render with the parent Calendar's color.
   */
  @Column({ type: 'text', nullable: true })
  importantColor: string | null;

  /** Original provider color value (Google colorId / CalDAV COLOR), kept for debugging. */
  @Column({ type: 'text', nullable: true })
  rawColorId: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  /**
   * Stamped with the current sync run's timestamp on every upsert. A sync
   * then deletes any row for the same calendar with a stale lastSeenAt —
   * this is how upstream cancellations/deletions are noticed without
   * needing provider sync-tokens/ETags.
   */
  @Column({ type: 'datetime' })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
