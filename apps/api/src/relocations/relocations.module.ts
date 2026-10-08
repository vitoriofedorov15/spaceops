import { Body, Controller, Get, Inject, Module, Param, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BookingsModule } from '../bookings/bookings.module';
import { BookingsService } from '../bookings/bookings.service';
import { Database } from '../database/database.module';
import { Audit } from '../audit/audit.module';
import { AuthRequest } from '../auth/auth.module';
import {
  Booking,
  dateRange,
  datetime,
  fail,
  manager,
  owner,
  pagination,
  uuid,
} from '../common/domain';
@ApiTags('Relocations & availability')
@ApiCookieAuth()
@Controller()
class RelocationsController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(BookingsService) private bookings: BookingsService,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Post('spaces/:id/blocks') async block(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    uuid(id);
    const input = z
      .object({
        starts_at: datetime,
        ends_at: datetime,
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(body);
    dateRange({ from: input.starts_at, to: input.ends_at });
    return this.db.transaction(async (q) => {
      await this.bookings.lockSpaces(q, [id]);
      const [space] = await q.query('SELECT id FROM spaces WHERE id=$1 AND NOT archived', [id]);
      if (!space) fail(404, 'NOT_FOUND', 'Space not found');
      const [block] = await q.query(
        'INSERT INTO availability_blocks(space_id,starts_at,ends_at,reason,author_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [id, input.starts_at, input.ends_at, input.reason, req.user.id],
      );
      const affected: Booking[] = await q.query(
        "UPDATE bookings SET needs_relocation=true,version=version+1 WHERE space_id=$1 AND status='active' AND starts_at<$3 AND ends_at>$2 AND ends_at>now() RETURNING *",
        [id, input.starts_at, input.ends_at],
      );
      for (const b of affected) {
        await this.bookings.invalidate(q, b.id);
        await this.audit.record(q, req.user.id, 'booking.affected_by_block', 'booking', b.id, {
          block_id: block.id,
        });
        await this.audit.notify(
          q,
          b.user_id,
          'booking.blocked',
          'This space is unavailable. The meeting “' + b.title + '” needs relocation.',
          b.id,
        );
      }
      await this.audit.record(q, req.user.id, 'space.blocked', 'space', id, {
        ...input,
        block_id: block.id,
      });
      return { ...block, affected_bookings: affected };
    });
  }
  @Get('blocks') async blocks(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    manager(req.user);
    const p = pagination(query);
    return this.db.query(
      'SELECT a.*,s.name AS space_name FROM availability_blocks a JOIN spaces s ON s.id=a.space_id WHERE a.released_at IS NULL AND a.ends_at>now() ORDER BY a.starts_at LIMIT $1 OFFSET $2',
      [p.limit, p.offset],
    );
  }
  @Post('blocks/:id/release') async release(@Param('id') id: string, @Req() req: AuthRequest) {
    manager(req.user);
    uuid(id);
    const [snapshot] = await this.db.query('SELECT * FROM availability_blocks WHERE id=$1', [id]);
    if (!snapshot) fail(404, 'NOT_FOUND', 'Restriction not found');
    return this.db.transaction(async (q) => {
      await this.bookings.lockSpaces(q, [snapshot.space_id]);
      const [block] = await q.query(
        'UPDATE availability_blocks SET released_at=now() WHERE id=$1 AND released_at IS NULL RETURNING *',
        [id],
      );
      if (!block) fail(409, 'ALREADY_RELEASED', 'This restriction has already been released');
      const cleared: Booking[] = await q.query(
        `UPDATE bookings b SET needs_relocation=false,version=version+1 WHERE b.space_id=$1 AND b.needs_relocation AND b.status='active' AND NOT EXISTS
        (SELECT 1 FROM availability_blocks a WHERE a.space_id=b.space_id AND a.released_at IS NULL AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at) RETURNING b.*`,
        [block.space_id],
      );
      for (const b of cleared) {
        await this.bookings.invalidate(q, b.id);
        await this.audit.record(q, req.user.id, 'booking.availability_restored', 'booking', b.id);
        await this.audit.notify(
          q,
          b.user_id,
          'space.reopened',
          'The space is available again for the meeting “' + b.title + '”',
          b.id,
        );
      }
      await this.audit.record(q, req.user.id, 'space.block_released', 'space', block.space_id, {
        block_id: id,
      });
      return block;
    });
  }
  @Get('blocks/:id/affected-bookings') async affected(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    manager(req.user);
    uuid(id);
    const p = pagination(query);
    return this.db.query(
      `SELECT b.*,s.name AS space_name FROM bookings b JOIN availability_blocks a ON a.space_id=b.space_id JOIN spaces s ON s.id=b.space_id WHERE a.id=$1 AND a.released_at IS NULL AND b.status='active' AND b.starts_at<a.ends_at AND b.ends_at>a.starts_at AND b.ends_at>now() ORDER BY b.starts_at LIMIT $2 OFFSET $3`,
      [id, p.limit, p.offset],
    );
  }
  @Get('bookings/:id/alternatives') async alternatives(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    const b = await this.bookings.get(uuid(id));
    if (b.status !== 'active' || !b.needs_relocation)
      fail(409, 'NO_RELOCATION_REQUIRED', 'No relocation is needed');
    return this.db.query(
      `SELECT s.*,f.number AS floor_number FROM spaces s JOIN floors f ON f.id=s.floor_id JOIN spaces original ON original.id=$1
      WHERE s.id<>original.id AND NOT s.archived AND s.type=original.type AND s.capacity>=$4
      AND NOT EXISTS(SELECT 1 FROM bookings x WHERE x.space_id=s.id AND x.status='active' AND x.starts_at<$3 AND x.ends_at>$2)
      AND NOT EXISTS(SELECT 1 FROM availability_blocks a WHERE a.space_id=s.id AND a.released_at IS NULL AND a.starts_at<$3 AND a.ends_at>$2)
      AND NOT EXISTS(SELECT 1 FROM booking_requirements r WHERE r.booking_id=$5 AND NOT EXISTS(SELECT 1 FROM equipment e WHERE e.space_id=s.id AND e.category=r.category AND e.state='working'))
      ORDER BY (s.floor_id=original.floor_id) DESC,s.capacity,s.name LIMIT 38`,
      [b.space_id, b.starts_at, b.ends_at, b.attendees, id],
    );
  }
  @Post('bookings/:id/relocation-proposals') async propose(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    uuid(id);
    const input = z
      .object({ space_id: z.string().uuid(), version: z.number().int().min(1) })
      .strict()
      .parse(body);
    const snapshot = await this.bookings.get(id);
    return this.db.transaction(async (q) => {
      await this.bookings.lockSpaces(q, [snapshot.space_id, input.space_id]);
      const b = await this.bookings.lockBooking(q, id, snapshot.space_id);
      if (b.status !== 'active' || !b.needs_relocation || b.version !== input.version)
        fail(409, 'STALE_BOOKING', 'The meeting has changed or no longer needs relocation');
      await this.checkTarget(q, b, input.space_id);
      await this.bookings.invalidate(q, id);
      const [proposal] = await q.query(
        'INSERT INTO relocation_proposals(booking_id,space_id,author_id,booking_version) VALUES($1,$2,$3,$4) RETURNING *',
        [id, input.space_id, req.user.id, b.version],
      );
      await this.audit.record(q, req.user.id, 'booking.relocation_proposed', 'booking', id, {
        proposal_id: proposal.id,
        space_id: input.space_id,
      });
      await this.audit.notify(
        q,
        b.user_id,
        'relocation.proposed',
        'A relocation has been proposed for “' + b.title + '”. Please confirm the new space.',
        id,
      );
      return proposal;
    });
  }
  private async checkTarget(
    q: import('../database/database.module').SQL,
    b: Booking,
    spaceId: string,
  ) {
    const [valid] = await q.query(
      'SELECT s.id FROM spaces s JOIN spaces original ON original.id=$2 WHERE s.id=$1 AND s.id<>original.id AND s.type=original.type',
      [spaceId, b.space_id],
    );
    if (!valid) fail(400, 'INVALID_TARGET', 'Choose a different space of the same type');
    const requirements = await q.query(
      'SELECT category FROM booking_requirements WHERE booking_id=$1',
      [b.id],
    );
    await this.bookings.check(
      q,
      {
        space_id: spaceId,
        title: b.title,
        starts_at: new Date(b.starts_at).toISOString(),
        ends_at: new Date(b.ends_at).toISOString(),
        attendees: b.attendees,
        comment: b.comment,
        requirements: requirements.map((r: { category: string }) => r.category),
      },
      b.id,
    );
  }
  @Get('relocation-proposals') async proposals(
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    const p = pagination(query);
    return this.db.query(
      `SELECT p.*,b.title,b.user_id,b.starts_at,b.ends_at,b.version,s.name AS space_name,old.name AS original_space_name FROM relocation_proposals p JOIN bookings b ON b.id=p.booking_id JOIN spaces s ON s.id=p.space_id JOIN spaces old ON old.id=b.space_id WHERE p.status='pending' AND ($1 OR b.user_id=$2) ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
      [req.user.role !== 'employee', req.user.id, p.limit, p.offset],
    );
  }
  @Post('relocation-proposals/:id/accept') accept(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.respond(uuid(id), req, true);
  }
  @Post('relocation-proposals/:id/reject') reject(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.respond(uuid(id), req, false);
  }
  private async respond(id: string, req: AuthRequest, accept: boolean) {
    const [snapshot] = await this.db.query(
      'SELECT p.*,b.space_id AS original_space FROM relocation_proposals p JOIN bookings b ON b.id=p.booking_id WHERE p.id=$1',
      [id],
    );
    if (!snapshot) fail(404, 'NOT_FOUND', 'Proposal not found');
    return this.db.transaction(async (q) => {
      await this.bookings.lockSpaces(q, [snapshot.original_space, snapshot.space_id]);
      const b = await this.bookings.lockBooking(q, snapshot.booking_id, snapshot.original_space);
      owner(req.user, b.user_id);
      const [proposal] = await q.query(
        'SELECT * FROM relocation_proposals WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (
        proposal.status !== 'pending' ||
        b.status !== 'active' ||
        b.version !== proposal.booking_version ||
        !b.needs_relocation
      )
        fail(409, 'STALE_PROPOSAL', 'This proposal is no longer valid');
      if (accept) {
        await this.checkTarget(q, b, proposal.space_id);
        await q.query(
          'UPDATE bookings SET space_id=$2,needs_relocation=false,version=version+1 WHERE id=$1',
          [b.id, proposal.space_id],
        );
      }
      const status = accept ? 'accepted' : 'rejected';
      await q.query('UPDATE relocation_proposals SET status=$2 WHERE id=$1', [id, status]);
      await this.audit.record(q, req.user.id, 'booking.relocation_' + status, 'booking', b.id, {
        from: b.space_id,
        to: proposal.space_id,
        proposal_id: id,
      });
      await this.audit.notify(
        q,
        proposal.author_id,
        'relocation.' + status,
        accept
          ? 'The meeting relocation has been accepted'
          : 'The relocation was declined. Please find another space.',
        b.id,
      );
      await this.audit.notify(
        q,
        b.user_id,
        'relocation.' + status,
        accept
          ? 'The meeting has moved to its new space'
          : 'Proposal declined. The original space is still unavailable.',
        b.id,
      );
      return { ok: true, status };
    });
  }
}
@Module({ imports: [BookingsModule], controllers: [RelocationsController] })
export class RelocationsModule {}
