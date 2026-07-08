import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CalendarAccount } from './calendar-account.entity';
import { CalendarEvent } from './calendar-event.entity';

@Entity()
@Index(['accountId', 'externalId'], { unique: true })
export class Calendar {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  accountId: number;

  @ManyToOne(() => CalendarAccount, (account) => account.calendars, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: CalendarAccount;

  /** The provider's own calendar id (Google calendarId, or CalDAV calendar URL). */
  @Column({ type: 'text' })
  externalId: string;

  @Column({ type: 'text' })
  name: string;

  /** The calendar's own default color as reported by the provider — informational fallback only. */
  @Column({ type: 'text', nullable: true })
  providerColor: string | null;

  /** Hex color the overlay renders this calendar's non-important events in — admin-editable. */
  @Column({ type: 'text' })
  color: string;

  /** Admin must opt in per calendar for it to appear in the overlay. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => CalendarEvent, (event) => event.calendar)
  events: CalendarEvent[];
}
