import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import { z } from 'zod';
import { BookingsService } from './bookings.service';
import { Database } from '../database/database.module';
import { AuthRequest } from '../auth/auth.module';
import { bookingSchema, dateRange, fail, pagination, uuid } from '../common/domain';
export const bookingOpenApi = {
  type: 'object',
  required: ['space_id', 'title', 'starts_at', 'ends_at', 'attendees'],
  properties: {
    space_id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
    attendees: { type: 'integer', minimum: 1 },
    requirements: { type: 'array', items: { type: 'string' } },
    comment: { type: 'string' },
    version: { type: 'integer' },
  },
};
@ApiTags('Bookings')
@ApiCookieAuth()
@Controller('bookings')
class BookingsController {
  constructor(
    @Inject(BookingsService) private service: BookingsService,
    @Inject(Database) private db: Database,
  ) {}
  @Get() async list(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const r = dateRange(query),
      p = pagination(query);
    const filter = z
      .object({
        mine: z.enum(['true', 'false']).optional(),
        needs_relocation: z.enum(['true', 'false']).optional(),
        status: z.enum(['active', 'cancelled']).optional(),
        space_id: z.string().uuid().optional(),
      })
      .parse(query);
    return this.db.query(
      `SELECT b.id,b.space_id,b.starts_at,b.ends_at,b.status,b.version,b.needs_relocation,s.name AS space_name,
      s.type,f.number AS floor_number, CASE WHEN b.user_id=$3 OR $4 THEN b.title ELSE 'Booked' END AS title,
      CASE WHEN b.user_id=$3 OR $4 THEN b.comment ELSE NULL END AS comment,
      CASE WHEN b.user_id=$3 OR $4 THEN b.user_id ELSE NULL END AS user_id,
      CASE WHEN b.user_id=$3 OR $4 THEN b.attendees ELSE NULL END AS attendees,
      CASE WHEN b.user_id=$3 OR $4 THEN ARRAY(SELECT category FROM booking_requirements WHERE booking_id=b.id) ELSE '{}' END AS requirements
      FROM bookings b JOIN spaces s ON s.id=b.space_id JOIN floors f ON f.id=s.floor_id
      WHERE b.starts_at<$2 AND b.ends_at>$1 AND (NOT $5 OR b.user_id=$3) AND ($6::text IS NULL OR b.status=$6) AND ($7::uuid IS NULL OR b.space_id=$7)
      AND ($10::boolean IS NULL OR b.needs_relocation=$10) ORDER BY b.starts_at LIMIT $8 OFFSET $9`,
      [
        r.from,
        r.to,
        req.user.id,
        req.user.role !== 'employee',
        filter.mine === 'true',
        filter.status ?? null,
        filter.space_id ?? null,
        p.limit,
        p.offset,
        filter.needs_relocation === undefined ? null : filter.needs_relocation === 'true',
      ],
    );
  }
  @Post() @ApiBody({ schema: bookingOpenApi }) create(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.create(req.user, bookingSchema.parse(body));
  }
  @Patch(':id') @ApiBody({ schema: bookingOpenApi }) update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const { version, ...input } = bookingSchema
      .extend({ version: z.number().int().min(1) })
      .parse(body);
    return this.service.update(req.user, uuid(id), version, input);
  }
  @Post(':id/cancel') cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const { version } = z
      .object({ version: z.number().int().min(1) })
      .strict()
      .parse(body);
    return this.service.cancel(req.user, uuid(id), version);
  }
  @Get(':id/history') async history(@Param('id') id: string, @Req() req: AuthRequest) {
    const b = await this.service.get(uuid(id));
    if (req.user.role === 'employee' && b.user_id !== req.user.id)
      fail(403, 'FORBIDDEN', 'You do not have access to this meeting’s history');
    return this.db.query(
      "SELECT a.id,a.action,a.changes,a.created_at,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity_type='booking' AND a.entity_id=$1 ORDER BY a.created_at",
      [id],
    );
  }
}
@Module({
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
