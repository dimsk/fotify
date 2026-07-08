import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateOverlayMode } from '../api/types';
import styles from './DateOverlay.module.css';

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
  const { i18n } = useTranslation();
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
      <span className={styles.date}>{new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(now)}</span>
      <span className={styles.time}>{new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(now)}</span>
    </div>
  );
}
