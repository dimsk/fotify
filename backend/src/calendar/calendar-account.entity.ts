import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Calendar } from './calendar.entity';

export type CalendarProvider = 'google' | 'apple';
export type CalendarAccountStatus = 'idle' | 'syncing' | 'error';

@Entity()
export class CalendarAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  provider: CalendarProvider;

  /** Display name — the discovered account email for google, user-entered for apple. */
  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'text', default: 'idle' })
  status: CalendarAccountStatus;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;

  // Google-only
  @Column({ type: 'text', nullable: true })
  googleEmail: string | null;

  @Column({ type: 'text', nullable: true })
  googleAccessTokenEnc: string | null;

  @Column({ type: 'text', nullable: true })
  googleRefreshTokenEnc: string | null;

  @Column({ type: 'datetime', nullable: true })
  googleAccessTokenExpiresAt: Date | null;

  // Apple/CalDAV-only
  @Column({ type: 'text', nullable: true })
  appleId: string | null;

  @Column({ type: 'text', nullable: true })
  applePasswordEnc: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Calendar, (calendar) => calendar.account)
  calendars: Calendar[];
}
