import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import { createApp } from '../src/bootstrap';
import { dataSource } from '../src/database/data-source';
import { seed, demoId } from '../src/database/seed';
process.env.NODE_ENV = 'test';
const origin = 'http://localhost:5173';
process.env.PUBLIC_URL = origin;
process.env.DEMO_PASSWORD = 'SpaceOps-test-2026!';
interface Client {
  cookies: string[];
  csrf: string;
}
let app: INestApplication, employee: Client, other: Client, dispatcher: Client, admin: Client;
const room = (n: number) => demoId(4, n);
const start = DateTime.now().setZone('Europe/Vienna').startOf('day').plus({ days: 2, hours: 10 });
const iso = (hours = 0) => start.plus({ hours }).toISO()!;
const payload = (space = room(1), extra: Record<string, unknown> = {}) => ({
  space_id: space,
  title: 'Private meeting',
  starts_at: iso(),
  ends_at: iso(1),
  attendees: 4,
  requirements: ['projector'],
  comment: 'Private strategy',
  ...extra,
});
function post(c: Client, path: string, body: object = {}) {
  return request(app.getHttpServer())
    .post('/api/v1' + path)
    .set('Origin', origin)
    .set('Cookie', c.cookies)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
}
function patch(c: Client, path: string, body: object) {
  return request(app.getHttpServer())
    .patch('/api/v1' + path)
    .set('Origin', origin)
    .set('Cookie', c.cookies)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
}
function get(c: Client, path: string) {
  return request(app.getHttpServer())
    .get('/api/v1' + path)
    .set('Cookie', c.cookies);
}
async function login(name: string) {
  const r = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ email: name + '@spaceops.demo', password: process.env.DEMO_PASSWORD });
  expect(r.status).toBe(201);
  const cookies = (r.headers['set-cookie'] as unknown as string[]).map((s) => s.split(';')[0]);
  return { cookies, csrf: cookies.find((s) => s.startsWith('spaceops_csrf='))!.split('=')[1] };
}
async function prepared() {
  const b = (await post(employee, '/bookings', payload())).body;
  const block = await post(dispatcher, `/spaces/${room(1)}/blocks`, {
    starts_at: iso(),
    ends_at: iso(1),
    reason: 'Repair projector',
  });
  expect(block.status).toBe(201);
  const affected = block.body.affected_bookings[0];
  const p = await post(dispatcher, `/bookings/${b.id}/relocation-proposals`, {
    space_id: room(2),
    version: affected.version,
  });
  expect(p.status).toBe(201);
  return { booking: affected, proposal: p.body, block: block.body };
}
beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error(
      'Integration tests require a dedicated DATABASE_URL whose database name ends in _test',
    );
  if (!dataSource.isInitialized) await dataSource.initialize();
  await dataSource.runMigrations();
  await seed();
  app = await createApp();
  await app.init();
  employee = await login('anna');
  other = await login('elena');
  dispatcher = await login('mark');
  admin = await login('alex');
});
beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE audit_logs,notifications,relocation_proposals,ticket_comments,tickets,availability_blocks,booking_requirements,bookings CASCADE',
  );
  await dataSource.query("UPDATE equipment SET state='working'");
});
afterAll(async () => {
  if (app) await app.close();
  else if (dataSource.isInitialized) await dataSource.destroy();
});
describe('PostgreSQL / REST acceptance', () => {
  it('authenticates all three roles; rejects missing Origin, CSRF and wrong password', async () => {
    expect((await get(employee, '/auth/me')).body.role).toBe('employee');
    expect((await get(dispatcher, '/auth/me')).body.role).toBe('dispatcher');
    expect((await get(admin, '/auth/me')).body.role).toBe('admin');
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'anna@spaceops.demo', password: 'wrong' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'absent@spaceops.demo', password: 'wrong' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/bookings')
          .set('Origin', origin)
          .set('Cookie', employee.cookies)
          .send(payload())
      ).status,
    ).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/spaces')).status).toBe(401);
  });
  it('returns one success and one 409 for concurrent overlapping bookings', async () => {
    const results = await Promise.all([
      post(employee, '/bookings', payload()),
      post(other, '/bookings', payload()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await dataSource.query("SELECT * FROM bookings WHERE status='active'")).length).toBe(1);
  });
  it('also rejects overlap at the database boundary without the service', async () => {
    await post(employee, '/bookings', payload());
    await expect(
      dataSource.query(
        'INSERT INTO bookings(space_id,user_id,title,starts_at,ends_at,attendees) VALUES($1,$2,$3,$4,$5,1)',
        [room(1), demoId(2, 4), 'Bypass', iso(), iso(1)],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23P01' } });
  });
  it('allows adjacent half-open intervals', async () => {
    expect((await post(employee, '/bookings', payload())).status).toBe(201);
    expect(
      (await post(other, '/bookings', payload(room(1), { starts_at: iso(1), ends_at: iso(2) })))
        .status,
    ).toBe(201);
  });
  it('serializes a simultaneous room block and booking', async () => {
    const [booking, block] = await Promise.all([
      post(employee, '/bookings', payload()),
      post(dispatcher, `/spaces/${room(1)}/blocks`, {
        starts_at: iso(),
        ends_at: iso(1),
        reason: 'Immediate repair',
      }),
    ]);
    expect(block.status).toBe(201);
    expect([201, 409]).toContain(booking.status);
    const rows = await dataSource.query("SELECT * FROM bookings WHERE status='active'");
    expect(rows.length).toBe(booking.status === 201 ? 1 : 0);
    if (rows.length) expect(rows[0].needs_relocation).toBe(true);
    expect((await post(other, '/bookings', payload())).status).toBe(409);
  });
  it('enforces owner checks and redacts other employees’ private data', async () => {
    const b = (await post(employee, '/bookings', payload())).body;
    expect(
      (await patch(other, `/bookings/${b.id}`, { ...payload(), version: b.version })).status,
    ).toBe(403);
    expect((await post(other, `/bookings/${b.id}/cancel`, { version: b.version })).status).toBe(
      403,
    );
    expect((await get(other, `/bookings/${b.id}/history`)).status).toBe(403);
    const r = await get(
      other,
      `/bookings?from=${encodeURIComponent(iso())}&to=${encodeURIComponent(iso(1))}`,
    );
    expect(r.body[0]).toMatchObject({
      title: 'Booked',
      comment: null,
      user_id: null,
      requirements: [],
    });
    expect(
      (
        await post(employee, `/spaces/${room(1)}/blocks`, {
          starts_at: iso(),
          ends_at: iso(1),
          reason: 'No permission',
        })
      ).status,
    ).toBe(403);
    expect((await patch(dispatcher, `/users/${demoId(2, 1)}/role`, { role: 'admin' })).status).toBe(
      403,
    );
  });
  it('checks capacity, desk attendees, hours, and working equipment', async () => {
    expect((await post(employee, '/bookings', payload(room(1), { attendees: 99 }))).status).toBe(
      400,
    );
    expect(
      (await post(employee, '/bookings', payload(room(101), { attendees: 2, requirements: [] })))
        .status,
    ).toBe(400);
    await dataSource.query(
      "UPDATE equipment SET state='broken' WHERE space_id=$1 AND category='projector'",
      [room(1)],
    );
    expect((await post(employee, '/bookings', payload())).status).toBe(409);
    expect(
      (
        await post(
          employee,
          '/bookings',
          payload(room(2), { starts_at: iso(12), ends_at: iso(13) }),
        )
      ).status,
    ).toBe(400);
  });
  it('runs booking → ticket → block → proposal → owner acceptance with audit and notifications', async () => {
    const b = (await post(employee, '/bookings', payload())).body;
    const ticket = await post(employee, '/tickets', {
      space_id: room(1),
      equipment_id: demoId(5, 12),
      title: 'Projector broken',
      description: 'No image on the screen',
      category: 'equipment',
      priority: 'high',
    });
    expect(ticket.status).toBe(201);
    expect((await get(other, `/tickets/${ticket.body.id}`)).status).toBe(403);
    const block = await post(dispatcher, `/spaces/${room(1)}/blocks`, {
      starts_at: iso(),
      ends_at: iso(1),
      reason: 'Repair projector',
    });
    expect(block.body.affected_bookings).toHaveLength(1);
    const affected = await get(dispatcher, `/blocks/${block.body.id}/affected-bookings`);
    expect(affected.body[0].id).toBe(b.id);
    const alternatives = await get(dispatcher, `/bookings/${b.id}/alternatives`);
    expect(alternatives.body[0].id).toBe(room(2));
    const p = (
      await post(dispatcher, `/bookings/${b.id}/relocation-proposals`, {
        space_id: room(2),
        version: block.body.affected_bookings[0].version,
      })
    ).body;
    expect((await post(dispatcher, `/relocation-proposals/${p.id}/accept`)).status).toBe(403);
    expect((await post(employee, `/relocation-proposals/${p.id}/accept`)).status).toBe(201);
    expect((await dataSource.query('SELECT * FROM bookings WHERE id=$1', [b.id]))[0]).toMatchObject(
      { space_id: room(2), needs_relocation: false, version: 3 },
    );
    const history = await get(employee, `/bookings/${b.id}/history`);
    expect(history.body.map((h: any) => h.action)).toContain('booking.relocation_accepted');
    expect((await get(employee, '/notifications')).body.unread).toBeGreaterThan(0);
  });
  it('does not double-book an alternative taken after a proposal', async () => {
    const { booking, proposal } = await prepared();
    expect((await post(other, '/bookings', payload(room(2)))).status).toBe(201);
    expect((await post(employee, `/relocation-proposals/${proposal.id}/accept`)).status).toBe(409);
    expect(
      (await dataSource.query('SELECT space_id FROM bookings WHERE id=$1', [booking.id]))[0]
        .space_id,
    ).toBe(room(1));
  });
  it('invalidates a proposal when the original booking is cancelled', async () => {
    const { booking, proposal } = await prepared();
    expect(
      (await post(employee, `/bookings/${booking.id}/cancel`, { version: booking.version })).status,
    ).toBe(201);
    expect((await post(employee, `/relocation-proposals/${proposal.id}/accept`)).status).toBe(409);
    expect(
      (
        await dataSource.query('SELECT status FROM relocation_proposals WHERE id=$1', [proposal.id])
      )[0].status,
    ).toBe('invalidated');
  });
  it('rejects a stale version after a booking is edited', async () => {
    const { booking, proposal } = await prepared();
    const updated = {
      ...payload(room(1), { starts_at: iso(2), ends_at: iso(3) }),
      version: booking.version,
    };
    expect((await patch(employee, `/bookings/${booking.id}`, updated)).status).toBe(200);
    expect((await post(employee, `/relocation-proposals/${proposal.id}/accept`)).status).toBe(409);
    expect((await patch(employee, `/bookings/${booking.id}`, updated)).status).toBe(409);
  });
  it('keeps the unresolved original booking when a proposal is rejected', async () => {
    const { booking, proposal } = await prepared();
    expect((await post(employee, `/relocation-proposals/${proposal.id}/reject`)).status).toBe(201);
    expect(
      (await dataSource.query('SELECT * FROM bookings WHERE id=$1', [booking.id]))[0],
    ).toMatchObject({ space_id: room(1), needs_relocation: true });
  });
  it('release clears relocation only after all intersecting blocks are released', async () => {
    const { booking, block } = await prepared();
    const second = (
      await post(dispatcher, `/spaces/${room(1)}/blocks`, {
        starts_at: iso(),
        ends_at: iso(1),
        reason: 'Another repair',
      })
    ).body;
    await post(dispatcher, `/blocks/${block.id}/release`);
    expect(
      (await dataSource.query('SELECT needs_relocation FROM bookings WHERE id=$1', [booking.id]))[0]
        .needs_relocation,
    ).toBe(true);
    await post(dispatcher, `/blocks/${second.id}/release`);
    expect(
      (await dataSource.query('SELECT needs_relocation FROM bookings WHERE id=$1', [booking.id]))[0]
        .needs_relocation,
    ).toBe(false);
  });
  it('requires a comment to reopen a closed ticket and protects its comments', async () => {
    const t = (
      await post(employee, '/tickets', {
        space_id: room(1),
        title: 'Test issue',
        description: 'Description',
        category: 'other',
      })
    ).body;
    expect((await patch(employee, `/tickets/${t.id}`, { status: 'in_progress' })).status).toBe(403);
    await patch(dispatcher, `/tickets/${t.id}`, {
      status: 'in_progress',
      assignee_id: demoId(2, 2),
    });
    await patch(dispatcher, `/tickets/${t.id}`, { status: 'resolved' });
    await patch(dispatcher, `/tickets/${t.id}`, { status: 'closed' });
    expect((await patch(dispatcher, `/tickets/${t.id}`, { status: 'in_progress' })).status).toBe(
      400,
    );
    expect(
      (
        await patch(dispatcher, `/tickets/${t.id}`, {
          status: 'in_progress',
          comment: 'Still broken',
        })
      ).status,
    ).toBe(200);
    expect((await post(other, `/tickets/${t.id}/comments`, { body: 'Unauthorized' })).status).toBe(
      403,
    );
  });
  it('merges overlapping blocks in analytics and reports null when no working time remains', async () => {
    const day = start.startOf('day'),
      end = day.plus({ days: 1 });
    for (let i = 0; i < 2; i++)
      await post(dispatcher, `/spaces/${room(1)}/blocks`, {
        starts_at: iso(),
        ends_at: iso(1),
        reason: 'Overlapping repair',
      });
    const query = `/analytics/overview?from=${encodeURIComponent(day.toISO()!)}&to=${encodeURIComponent(end.toISO()!)}`;
    const r = await get(employee, query);
    expect(r.status).toBe(200);
    const row = r.body.spaces.find((s: any) => s.id === room(1));
    expect(row.available_minutes).toBe(13 * 60);
    expect(row.utilization).toBe(0);
    await post(dispatcher, `/spaces/${room(1)}/blocks`, {
      starts_at: day.toISO(),
      ends_at: end.toISO(),
      reason: 'All day repair',
    });
    const zero = await get(employee, query);
    expect(zero.body.spaces.find((s: any) => s.id === room(1)).utilization).toBeNull();
  });
  it('serializes proposal acceptance against cancellation', async () => {
    const { booking, proposal } = await prepared();
    const results = await Promise.all([
      post(employee, `/relocation-proposals/${proposal.id}/accept`),
      post(employee, `/bookings/${booking.id}/cancel`, { version: booking.version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const [current] = await dataSource.query('SELECT * FROM bookings WHERE id=$1', [booking.id]);
    if (current.status === 'active') expect(current.space_id).toBe(room(2));
    else expect(current.status).toBe('cancelled');
  });
  it('preserves elapsed blocked time after a restriction is released', async () => {
    const day = start.minus({ days: 4 }).startOf('day');
    await dataSource.query(
      'INSERT INTO availability_blocks(space_id,starts_at,ends_at,reason,author_id,released_at) VALUES($1,$2,$3,$4,$5,$6)',
      [
        room(1),
        day.plus({ hours: 8 }).toISO(),
        day.plus({ hours: 12 }).toISO(),
        'Historical repair',
        demoId(2, 2),
        day.plus({ hours: 9 }).toISO(),
      ],
    );
    const result = await get(
      employee,
      `/analytics/overview?from=${encodeURIComponent(day.toISO()!)}&to=${encodeURIComponent(day.plus({ days: 1 }).toISO()!)}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.spaces.find((r: any) => r.id === room(1)).available_minutes).toBe(13 * 60);
  });
});
