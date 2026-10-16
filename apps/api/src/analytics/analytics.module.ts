import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Database } from '../database/database.module';
import { dateRange } from '../common/domain';
@ApiTags('Analytics')
@ApiCookieAuth()
@Controller('analytics')
class AnalyticsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('overview') async overview(@Query() query: Record<string, string>) {
    const r = dateRange(query);
    const [counts] = await this.db.query(
      `SELECT count(*) FILTER(WHERE status='active')::int AS active_bookings,count(*) FILTER(WHERE status='cancelled')::int AS cancelled_bookings FROM bookings WHERE starts_at<$2 AND ends_at>$1`,
      [r.from, r.to],
    );
    const [tickets] = await this.db.query(
      `SELECT count(*) FILTER(WHERE status IN ('new','in_progress'))::int AS open_tickets,avg(extract(epoch FROM resolved_at-created_at)/3600) FILTER(WHERE resolved_at IS NOT NULL AND resolved_at>=$1 AND resolved_at<$2)::float AS avg_resolution_hours FROM tickets`,
      [r.from, r.to],
    );
    // range_agg merges overlapping blocks, so the denominator never subtracts the same minute twice.
    const spaces = await this.db.query(
      `WITH shifts AS (
      SELECT s.id,s.name,g.day,tstzrange(GREATEST((g.day+si.opens_at) AT TIME ZONE si.timezone,$1::timestamptz),LEAST((g.day+si.closes_at) AT TIME ZONE si.timezone,$2::timestamptz),'[)') AS work
      FROM spaces s JOIN floors f ON f.id=s.floor_id JOIN sites si ON si.id=f.site_id
      CROSS JOIN LATERAL (SELECT d::date AS day FROM generate_series(($1::timestamptz AT TIME ZONE si.timezone)::date,($2::timestamptz AT TIME ZONE si.timezone)::date,interval '1 day') d) g
      WHERE s.type='room' AND NOT s.archived AND (g.day+si.opens_at) AT TIME ZONE si.timezone<$2 AND (g.day+si.closes_at) AT TIME ZONE si.timezone>$1
    ),available AS (
      SELECT sh.id,sh.name,sh.day,tstzmultirange(sh.work)-COALESCE((SELECT range_agg(tstzrange(a.starts_at,LEAST(a.ends_at,COALESCE(a.released_at,a.ends_at)),'[)')*sh.work) FROM availability_blocks a WHERE a.space_id=sh.id AND LEAST(a.ends_at,COALESCE(a.released_at,a.ends_at))>a.starts_at AND tstzrange(a.starts_at,GREATEST(a.starts_at,LEAST(a.ends_at,COALESCE(a.released_at,a.ends_at))),'[)')&&sh.work),'{}'::tstzmultirange) AS ranges FROM shifts sh
    ),segments AS (SELECT a.id,a.name,a.day,u.segment FROM available a CROSS JOIN LATERAL unnest(a.ranges) u(segment)), totals AS (
      SELECT id,name,sum(extract(epoch FROM upper(segment)-lower(segment))/60)::float AS available_minutes,
      sum(COALESCE((SELECT sum(extract(epoch FROM upper(tstzrange(b.starts_at,b.ends_at,'[)')*segment)-lower(tstzrange(b.starts_at,b.ends_at,'[)')*segment))/60) FROM bookings b WHERE b.space_id=segments.id AND b.status='active' AND tstzrange(b.starts_at,b.ends_at,'[)')&&segment),0))::float AS booked_minutes
      FROM segments GROUP BY id,name
    ) SELECT s.id,s.name,COALESCE(t.available_minutes,0)::float AS available_minutes,COALESCE(t.booked_minutes,0)::float AS booked_minutes,
      CASE WHEN t.available_minutes>0 THEN round((100*t.booked_minutes/t.available_minutes)::numeric,1)::float ELSE NULL END AS utilization
      FROM spaces s LEFT JOIN totals t ON t.id=s.id WHERE s.type='room' AND NOT s.archived ORDER BY s.name`,
      [r.from, r.to],
    );
    const available = spaces.reduce((a, s) => a + s.available_minutes, 0),
      booked = spaces.reduce((a, s) => a + s.booked_minutes, 0);
    return {
      ...counts,
      ...tickets,
      utilization: available > 0 ? Math.round((1000 * booked) / available) / 10 : null,
      spaces,
      from: r.from,
      to: r.to,
    };
  }
}
@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
