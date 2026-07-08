import { useEffect, useState } from 'react';
import { MapPin, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { CalendarTodayEvent, CalendarTodayResponse } from '../api/types';
import { formatEventTime } from './format-date';
import styles from './CalendarOverlay.module.css';

// Cheap cache read — real freshness is bounded by the backend's own sync
// cron (every 15 min) regardless of how often this polls.
const CALENDAR_REFRESH_MS = 120_000;
const MAX_VISIBLE_PER_DAY = 4;

export function CalendarOverlay() {
  const { t } = useTranslation();
  const [data, setData] = useState<CalendarTodayResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api.calendar
        .today()
        .then((res) => {
          if (!cancelled) setData(res);
        })
        // Swallow errors and keep showing the last-known-good data rather
        // than flickering to empty on a transient network blip.
        .catch(() => undefined);
    };
    refresh();
    const interval = setInterval(refresh, CALENDAR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // All gating (overlay enabled, inside the configured time window) is
  // already decided server-side — this component just renders what it's told.
  const shown = (data?.visible ?? false) && (data?.events.length ?? 0) > 0;
  const events = data?.events ?? [];
  const todayEvents = events.filter((ev) => ev.day === 'today');
  const tomorrowEvents = events.filter((ev) => ev.day === 'tomorrow');

  return (
    <div className={`${styles.card} ${shown ? styles.visible : styles.hidden}`} aria-hidden={!shown}>
      <DaySection label={t('slideshow.today')} events={todayEvents} />
      <DaySection label={t('slideshow.tomorrow')} events={tomorrowEvents} />
    </div>
  );
}

function DaySection({ label, events }: { label: string; events: CalendarTodayEvent[] }) {
  const { t } = useTranslation();
  if (events.length === 0) return null;
  const overflow = events.length - MAX_VISIBLE_PER_DAY;

  return (
    <div className={styles.section}>
      <span className={styles.dayLabel}>{label}</span>
      {events.slice(0, MAX_VISIBLE_PER_DAY).map((ev) => (
        <div key={ev.id} className={styles.eventBlock}>
          <div className={`${styles.row} ${ev.important ? styles.important : ''}`}>
            <span className={styles.dot} style={{ background: ev.color }} />
            {ev.important && <Star size={11} fill={ev.color} color={ev.color} />}
            <span className={styles.time}>{ev.isAllDay ? t('slideshow.allDay') : formatEventTime(ev.startAt)}</span>
            <span className={styles.title}>{ev.title}</span>
          </div>
          {ev.location && (
            <div className={styles.location}>
              <MapPin size={10} />
              <span>{ev.location}</span>
            </div>
          )}
        </div>
      ))}
      {overflow > 0 && <span className={styles.more}>{t('slideshow.more', { count: overflow })}</span>}
    </div>
  );
}
