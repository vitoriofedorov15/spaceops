import { DateTime } from 'luxon';
export const TZ = 'Europe/Vienna';
export const localDate = (iso?: string) =>
  (iso ? DateTime.fromISO(iso) : DateTime.now()).setZone(TZ);
export const formatTime = (iso: string) => localDate(iso).toFormat('HH:mm');
export const formatDay = (iso: string) => localDate(iso).setLocale('en-GB').toFormat('d MMM');
export function defaultSlot() {
  const now = DateTime.now().setZone(TZ);
  let start = now.startOf('hour').plus({ minutes: (Math.floor(now.minute / 15) + 1) * 15 });
  if (start.hour < 8) start = start.set({ hour: 10, minute: 0 });
  if (start.hour >= 21) start = start.plus({ days: 1 }).set({ hour: 10, minute: 0 });
  return {
    date: start.toISODate()!,
    start: start.toFormat('HH:mm'),
    end: start.plus({ hours: 1 }).toFormat('HH:mm'),
  };
}
export function isoTime(date: string, time: string) {
  return DateTime.fromISO(date + 'T' + time, { zone: TZ }).toISO()!;
}
export function dayRange(date: string) {
  const d = DateTime.fromISO(date, { zone: TZ }).startOf('day');
  return { from: d.toISO()!, to: d.plus({ days: 1 }).toISO()! };
}
