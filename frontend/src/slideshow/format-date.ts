import i18n from '../i18n';

export function formatCapturedAt(capturedAt: string | null): string | null {
  if (!capturedAt) return null;
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatEventTime(startAt: string): string {
  return new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startAt));
}

/** Aperture (f-number) formatted as "f/2.8" — rounded to one decimal place, dropping a trailing ".0" (e.g. 4 -> "f/4", 2.8 -> "f/2.8"). */
export function formatAperture(aperture: number | null | undefined): string | null {
  if (aperture === null || aperture === undefined || !Number.isFinite(aperture)) {
    return null;
  }
  const rounded = Math.round(aperture * 10) / 10;
  return `f/${rounded}`;
}

/**
 * The per-photo slideshow caption: EXIF GPS location (if resolved at import)
 * on its own line above the capture date, since a photo can have either,
 * both, or neither. Joined with a plain "\n" — the caption element renders
 * it with `white-space: pre-line` rather than separate DOM nodes.
 *
 * The lens/aperture (if present in EXIF) is placed on the same line as the
 * date, to its left, separated by a small circle ("•").
 */
export function formatCaption(photo: {
  capturedAt: string | null;
  locationCity?: string | null;
  locationCountry?: string | null;
  lens?: string | null;
  aperture?: number | null;
}): string {
  const date = formatCapturedAt(photo.capturedAt) ?? '';
  const location = [photo.locationCity, photo.locationCountry].filter(Boolean).join(', ');
  const lensInfo = [photo.lens, formatAperture(photo.aperture)].filter(Boolean).join(' ');
  const dateLine = [lensInfo, date].filter(Boolean).join(' • ');
  if (!location) return dateLine;
  if (!dateLine) return location;
  return `${location}\n${dateLine}`;
}
