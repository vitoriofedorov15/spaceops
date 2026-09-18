import { Inject, Injectable } from '@nestjs/common';
import { Database, SQL } from '../database/database.module';
import { Audit } from '../audit/audit.module';
import { Booking, BookingInput, fail, owner, User, validateInterval } from '../common/domain';
@Injectable()
export class BookingsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Audit) readonly audit: Audit,
  ) {}
  async lockSpaces(q: SQL, ids: string[]) {
    await q.query('SELECT id FROM spaces WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [...new Set(ids)].sort(),
    ]);
  }
  async lockBooking(q: SQL, id: string, expectedSpace: string): Promise<Booking> {
    const [booking] = await q.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [id]);
    if (!booking) fail(404, 'NOT_FOUND', 'Booking not found');
    if (booking.space_id !== expectedSpace)
      fail(409, 'STALE_BOOKING', 'This booking has changed. Refresh the page');
    return booking;
  }
  async get(id: string): Promise<Booking> {
    const [booking] = await this.db.query<Booking>('SELECT * FROM bookings WHERE id=$1', [id]);
    if (!booking) fail(404, 'NOT_FOUND', 'Booking not found');
    return booking;
  }
  async check(q: SQL, input: BookingInput, excludeId: string | null = null) {
    const [space] = await q.query(
      `SELECT s.*,si.timezone,si.opens_at::text,si.closes_at::text FROM spaces s
      JOIN floors f ON f.id=s.floor_id JOIN sites si ON si.id=f.site_id WHERE s.id=$1`,
      [input.space_id],
    );
    if (!space || space.archived) fail(404, 'NOT_FOUND', 'Space is unavailable');
    validateInterval(input, space);
    if (input.attendees > space.capacity || (space.type === 'desk' && input.attendees !== 1))
      fail(400, 'CAPACITY', 'There are not enough seats for the attendees');
    for (const category of new Set(input.requirements)) {
      const [eq] = await q.query(
        "SELECT id FROM equipment WHERE space_id=$1 AND category=$2 AND state='working' LIMIT 1",
        [space.id, category],
      );
      if (!eq) fail(409, 'EQUIPMENT_UNAVAILABLE', `Working equipment is unavailable: ${category}`);
    }
    const [conflict] = await q.query(
      `SELECT EXISTS(SELECT 1 FROM bookings WHERE space_id=$1 AND status='active' AND starts_at<$3 AND ends_at>$2 AND ($4::uuid IS NULL OR id<>$4))
      OR EXISTS(SELECT 1 FROM availability_blocks WHERE space_id=$1 AND released_at IS NULL AND starts_at<$3 AND ends_at>$2) AS conflict`,
      [space.id, input.starts_at, input.ends_at, excludeId],
    );
    if (conflict.conflict)
      fail(409, 'SPACE_UNAVAILABLE', 'This space is booked or restricted during the selected time');
    return space;
  }
  async requirements(q: SQL, id: string, values: string[]) {
    await q.query('DELETE FROM booking_requirements WHERE booking_id=$1', [id]);
    for (const category of new Set(values))
      await q.query('INSERT INTO booking_requirements(booking_id,category) VALUES($1,$2)', [
        id,
        category,
      ]);
  }
  async invalidate(q: SQL, id: string) {
    await q.query(
      "UPDATE relocation_proposals SET status='invalidated' WHERE booking_id=$1 AND status='pending'",
      [id],
    );
  }
  async create(user: User, input: BookingInput) {
    return this.db.transaction(async (q) => {
      await this.lockSpaces(q, [input.space_id]);
      await this.check(q, input);
      const [booking] = await q.query(
        `INSERT INTO bookings(space_id,user_id,title,starts_at,ends_at,attendees,comment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          input.space_id,
          user.id,
          input.title,
          input.starts_at,
          input.ends_at,
          input.attendees,
          input.comment,
        ],
      );
      await this.requirements(q, booking.id, input.requirements);
      await this.audit.record(q, user.id, 'booking.created', 'booking', booking.id, {
        space_id: input.space_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
      });
      return booking;
    });
  }
  async update(user: User, id: string, version: number, input: BookingInput) {
    const snapshot = await this.get(id);
    owner(user, snapshot.user_id);
    return this.db.transaction(async (q) => {
      await this.lockSpaces(q, [snapshot.space_id, input.space_id]);
      const b = await this.lockBooking(q, id, snapshot.space_id);
      owner(user, b.user_id);
      if (b.version !== version || b.status !== 'active')
        fail(409, 'STALE_BOOKING', 'This booking has changed or has been cancelled');
      await this.check(q, input, id);
      const [updated] = await q.query(
        `UPDATE bookings SET space_id=$2,title=$3,starts_at=$4,ends_at=$5,attendees=$6,comment=$7,version=version+1,needs_relocation=false WHERE id=$1 RETURNING *`,
        [
          id,
          input.space_id,
          input.title,
          input.starts_at,
          input.ends_at,
          input.attendees,
          input.comment,
        ],
      );
      await this.requirements(q, id, input.requirements);
      await this.invalidate(q, id);
      await this.audit.record(q, user.id, 'booking.updated', 'booking', id, {
        from: b,
        to: updated,
      });
      return updated;
    });
  }
  async cancel(user: User, id: string, version: number) {
    const snapshot = await this.get(id);
    if (user.role === 'employee') owner(user, snapshot.user_id);
    return this.db.transaction(async (q) => {
      await this.lockSpaces(q, [snapshot.space_id]);
      const b = await this.lockBooking(q, id, snapshot.space_id);
      if (user.role === 'employee') owner(user, b.user_id);
      if (b.version !== version || b.status !== 'active')
        fail(409, 'STALE_BOOKING', 'This booking has changed or has already been cancelled');
      const [updated] = await q.query(
        "UPDATE bookings SET status='cancelled',version=version+1,needs_relocation=false WHERE id=$1 RETURNING *",
        [id],
      );
      await this.invalidate(q, id);
      await this.audit.record(q, user.id, 'booking.cancelled', 'booking', id);
      await this.audit.notify(
        q,
        b.user_id,
        'booking.cancelled',
        'Booking cancelled: ' + b.title,
        id,
      );
      return updated;
    });
  }
}
