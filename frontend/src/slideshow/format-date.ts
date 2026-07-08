const formatter = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCapturedAt(capturedAt: string | null): string | null {
  if (!capturedAt) return null;
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatter.format(date);
}

const eventTimeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function formatEventTime(startAt: string): string {
  return eventTimeFormatter.format(new Date(startAt));
}

/**
 * The per-photo slideshow caption: EXIF GPS location (if resolved at import)
 * on its own line above the capture date, since a photo can have either,
 * both, or neither. Joined with a plain "\n" — the caption element renders
 * it with `white-space: pre-line` rather than separate DOM nodes.
 */
export function formatCaption(photo: {
  capturedAt: string | null;
  locationCity?: string | null;
  locationCountry?: string | null;
}): string {
  const date = formatCapturedAt(photo.capturedAt) ?? '';
  const location = [photo.locationCity, photo.locationCountry].filter(Boolean).join(', ');
  if (!location) return date;
  if (!date) return location;
  return `${location}\n${date}`;
}
