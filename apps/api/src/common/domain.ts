import { HttpException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { z } from 'zod';
export type Role = 'employee' | 'dispatcher' | 'admin';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface Booking {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  comment: string;
  starts_at: Date;
  ends_at: Date;
  attendees: number;
  status: string;
  version: number;
  needs_relocation: boolean;
  requirements?: string[];
}
export interface Space {
  id: string;
  floor_id: string;
  name: string;
  type: 'room' | 'desk';
  capacity: number;
  archived: boolean;
}
export const fail = (
  status: number,
  code: string,
  message: string,
  details: unknown = null,
): never => {
  throw new HttpException({ code, message, details }, status);
};
export const manager = (u: User): void => {
  if (u.role === 'employee')
    fail(403, 'FORBIDDEN', 'Available to dispatchers and administrators only');
};
export const owner = (u: User, id: string): void => {
  if (u.id !== id) fail(403, 'FORBIDDEN', 'You can only access your own record');
};
export const idSchema = z.string().uuid();
export const uuid = (id: string): string => idSchema.parse(id);
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export function pagination(query: unknown) {
  const { page, limit } = pageSchema.parse(query);
  return { page, limit, offset: (page - 1) * limit };
}
export const datetime = z.string().datetime({ offset: true });
export const rangeSchema = z.object({ from: datetime, to: datetime }).superRefine((v, c) => {
  const n = Date.parse(v.to) - Date.parse(v.from);
  if (n <= 0 || n > 93 * 86400000)
    c.addIssue({ code: 'custom', message: 'Choose a period between 1 minute and 93 days' });
});
export function dateRange(query: Record<string, unknown>) {
  return rangeSchema.parse({
    from: query.from ?? new Date().toISOString(),
    to: query.to ?? new Date(Date.now() + 7 * 86400000).toISOString(),
  });
}
export const bookingSchema = z
  .object({
    space_id: idSchema,
    title: z.string().trim().min(1).max(140),
    starts_at: datetime,
    ends_at: datetime,
    attendees: z.number().int().min(1).max(100),
    requirements: z.array(z.string().min(1).max(60)).max(10).default([]),
    comment: z.string().max(2000).default(''),
  })
  .strict();
export type BookingInput = z.infer<typeof bookingSchema>;
export function validateInterval(
  input: BookingInput,
  site: { timezone: string; opens_at: string; closes_at: string },
  now = Date.now(),
) {
  const start = DateTime.fromISO(input.starts_at).setZone(site.timezone);
  const end = DateTime.fromISO(input.ends_at).setZone(site.timezone);
  const duration = end.toMillis() - start.toMillis();
  if (!start.isValid || !end.isValid || duration < 900000 || duration > 28800000)
    fail(400, 'INVALID_DURATION', 'Bookings must last between 15 minutes and 8 hours');
  if (start.toMillis() < now) fail(400, 'PAST_BOOKING', 'You cannot book a time in the past');
  if (
    start.minute % 15 ||
    end.minute % 15 ||
    start.second ||
    end.second ||
    start.millisecond ||
    end.millisecond
  )
    fail(400, 'TIME_STEP', 'Times must be in 15-minute increments');
  const minutes = (v: DateTime) => v.hour * 60 + v.minute;
  const parse = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  if (
    start.toISODate() !== end.toISODate() ||
    minutes(start) < parse(site.opens_at) ||
    minutes(end) > parse(site.closes_at)
  )
    fail(400, 'OUTSIDE_HOURS', 'Site opening hours are 08:00–22:00');
}
