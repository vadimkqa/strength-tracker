export function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localDate(time: number, zone: string) {
  if (!formatters.has(zone))
    formatters.set(
      zone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  const parts = formatters.get(zone)!.formatToParts(time);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function calendarWeek(time: number, zone: string) {
  const date = localDate(time, zone),
    day = new Date(date + 'T12:00:00Z').getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export interface CalendarConfig {
  version: 1;
  enabled: boolean;
  /** A local date inside the selected program week; its Monday anchors rotation. */
  anchorDate: string;
  anchorWeek: number;
  /** Explicit user assignments by stable template ID; imported metadata is not overwritten. */
  days: Record<string, number>;
}
export function validDate(date: unknown): date is string {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= '1900-01-01' &&
    date <= '2199-12-31' &&
    !Number.isNaN(Date.parse(date + 'T12:00Z')) &&
    new Date(date + 'T12:00Z').toISOString().slice(0, 10) === date
  );
}
export function assertCalendar(config: CalendarConfig) {
  if (
    !config ||
    config.version !== 1 ||
    typeof config.enabled !== 'boolean' ||
    !validDate(config.anchorDate) ||
    !Number.isInteger(config.anchorWeek) ||
    config.anchorWeek < 1 ||
    !config.days ||
    typeof config.days !== 'object' ||
    Array.isArray(config.days) ||
    !Object.values(config.days).every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )
    throw Error('Invalid calendar selection settings. Original data has been preserved.');
}
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export function weekdayNumber(day: string | null) {
  const value = (day || '').trim().toLowerCase().replace(/\.$/, '');
  const index = WEEKDAYS.findIndex(
    (d) => value === d.toLowerCase() || value === d.slice(0, 3).toLowerCase(),
  );
  return index < 0 ? null : index;
}
export function monday(date: string) {
  return calendarWeek(Date.parse(date + 'T12:00Z'), 'UTC');
}
export function cycleForDate(date: string, config: CalendarConfig, weeks: number[]) {
  const anchor = weeks.indexOf(config.anchorWeek);
  if (anchor < 0 || !weeks.length) return undefined;
  const distance = Math.round(
    (Date.parse(monday(date) + 'T12:00Z') - Date.parse(monday(config.anchorDate) + 'T12:00Z')) /
      604800000,
  );
  return weeks[(((anchor + distance) % weeks.length) + weeks.length) % weeks.length];
}
