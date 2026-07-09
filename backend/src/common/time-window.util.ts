/** Parses a validated "HH:mm" string into minutes-since-midnight, or null if malformed. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getMinutesInTimeZone(now: Date, timeZone?: string | null): number {
  if (!timeZone) return now.getHours() * 60 + now.getMinutes();

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (Number.isInteger(hour) && Number.isInteger(minute)) {
      return hour * 60 + minute;
    }
  } catch {
    // Invalid or unsupported timezone: fall back to the server's local time.
  }

  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Whether `now` falls within [start, end), wrapping past midnight when
 * start > end (e.g. 22:00-07:00 covers 22:00 through 06:59 the next day).
 * Returns false for malformed times or a zero-length window (start === end).
 */
export function isWithinTimeWindow(
  now: Date,
  start: string,
  end: string,
  timeZone?: string | null,
): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

  const nowMinutes = getMinutesInTimeZone(now, timeZone);
  return startMinutes < endMinutes
    ? nowMinutes >= startMinutes && nowMinutes < endMinutes
    : nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
