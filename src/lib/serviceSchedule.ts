export function calendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

export function isoDate(date: Date) {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function parseServiceDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = calendarDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isoDate(date) === value ? date : null;
}

export function addCalendarDays(date: Date, amount: number) {
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount);
}

export function moveCalendarMonth(date: Date, amount: number) {
  const target = calendarDate(date.getUTCFullYear(), date.getUTCMonth() + amount, 1);
  const last = calendarDate(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
  return calendarDate(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(date.getUTCDate(), last),
  );
}

export function manilaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return calendarDate(Number(value.year), Number(value.month) - 1, Number(value.day));
}

export const quarterMinutes = ['00', '15', '30', '45'] as const;
export type Period = 'AM' | 'PM';
export function parseServiceTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const hour = Number(match[1]);
  return { hour: hour % 12 || 12, minute: match[2], period: (hour >= 12 ? 'PM' : 'AM') as Period };
}

export function quarterTime(hour: number, minute: string, period: Period) {
  if (
    hour < 1 ||
    hour > 12 ||
    !Number.isInteger(hour) ||
    !quarterMinutes.some((item) => item === minute)
  )
    return null;
  return `${String((hour % 12) + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}

export function formatServiceTime(value: string) {
  const time = parseServiceTime(value);
  return time ? `${time.hour}:${time.minute} ${time.period}` : '';
}

export function nextQuarterTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const total = (Number(value.hour) * 60 + Math.ceil(Number(value.minute) / 15) * 15) % (24 * 60);
  return parseServiceTime(
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
  )!;
}
