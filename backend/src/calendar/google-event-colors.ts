/**
 * Google Calendar's fixed 11-color per-event palette (distinct id-space from
 * the 24-color per-calendar palette) — published at
 * https://developers.google.com/calendar/api/v3/reference/colors. Hardcoded
 * since it almost never changes and fetching /colors on every sync would be
 * wasted API quota for a handful of stable values.
 */
export const GOOGLE_EVENT_COLOR_HEX: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6bf26',
  '6': '#f4511e',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d50000',
};
