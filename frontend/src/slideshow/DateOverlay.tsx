import { useEffect, useState } from 'react';
import type { DateOverlayMode } from '../api/types';
import styles from './DateOverlay.module.css';

const DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

interface DateOverlayProps {
  enabled: boolean;
  mode: DateOverlayMode;
  timedVisible: boolean;
  companionVisible?: boolean;
}

export function DateOverlay({
  enabled,
  mode,
  timedVisible,
  companionVisible = false,
}: DateOverlayProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const visible =
    (enabled && (mode === 'always' || timedVisible)) || companionVisible;
  const className = `${styles.dateTime} ${visible ? styles.visible : ''}`;

  return (
    <div className={className} aria-hidden={!visible}>
      <span className={styles.date}>{DATE_FORMATTER.format(now)}</span>
      <span className={styles.time}>{TIME_FORMATTER.format(now)}</span>
    </div>
  );
}
