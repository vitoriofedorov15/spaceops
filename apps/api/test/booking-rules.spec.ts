import { HttpException } from '@nestjs/common';
import { validateInterval, BookingInput } from '../src/common/domain';
import { DateTime } from 'luxon';
const site = { timezone: 'Europe/Vienna', opens_at: '08:00:00', closes_at: '22:00:00' };
function input(start: string, end: string): BookingInput {
  return {
    space_id: '00000000-0000-4000-0004-000000000001',
    title: 'Test',
    starts_at: start,
    ends_at: end,
    attendees: 1,
    requirements: [],
    comment: '',
  };
}
function local(time: string) {
  return DateTime.fromISO('2030-07-10T' + time, { zone: site.timezone }).toISO()!;
}
function code(fn: () => void) {
  try {
    fn();
    return null;
  } catch (e) {
    return ((e as HttpException).getResponse() as { code: string }).code;
  }
}
describe('Booking time rules in the site timezone', () => {
  it('accepts 15 minutes and exact opening/closing boundaries', () => {
    expect(() => validateInterval(input(local('08:00'), local('08:15')), site, 0)).not.toThrow();
    expect(() => validateInterval(input(local('21:45'), local('22:00')), site, 0)).not.toThrow();
  });
  it.each([
    ['10:00', '10:00'],
    ['10:00', '09:00'],
    ['10:00', '10:10'],
    ['08:00', '16:15'],
  ])('rejects invalid duration %s–%s', (a, b) => {
    expect(code(() => validateInterval(input(local(a), local(b)), site, 0))).toBe(
      'INVALID_DURATION',
    );
  });
  it('rejects non-quarter-hour and seconds', () => {
    expect(code(() => validateInterval(input(local('10:01'), local('11:01')), site, 0))).toBe(
      'TIME_STEP',
    );
    expect(code(() => validateInterval(input(local('10:00:01'), local('11:00:01')), site, 0))).toBe(
      'TIME_STEP',
    );
  });
  it('rejects past time', () => {
    expect(
      code(() =>
        validateInterval(input(local('10:00'), local('11:00')), site, Date.parse(local('10:01'))),
      ),
    ).toBe('PAST_BOOKING');
  });
  it('uses Vienna time even when an offset is different', () => {
    expect(() =>
      validateInterval(input('2030-07-10T06:00:00Z', '2030-07-10T07:00:00Z'), site, 0),
    ).not.toThrow();
    expect(
      code(() => validateInterval(input('2030-07-10T05:00:00Z', '2030-07-10T06:00:00Z'), site, 0)),
    ).toBe('OUTSIDE_HOURS');
  });
});
