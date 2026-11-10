import { isoTime, dayRange } from './time';
it('converts local summer and winter time to the correct UTC offset', () => {
  expect(isoTime('2030-07-10', '10:00')).toBe('2030-07-10T10:00:00.000+02:00');
  expect(isoTime('2030-01-10', '10:00')).toBe('2030-01-10T10:00:00.000+01:00');
});
it('handles a 23-hour DST day without assuming 24 hours', () => {
  const r = dayRange('2030-03-31');
  expect(Date.parse(r.to) - Date.parse(r.from)).toBe(23 * 3600000);
});
