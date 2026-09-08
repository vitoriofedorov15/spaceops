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
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthRequest } from '../auth/auth.module';
import { Database } from '../database/database.module';
import { Audit } from '../audit/audit.module';
import { dateRange, fail, manager, pagination, uuid } from '../common/domain';
export const spaceQuery = `SELECT s.*,f.number AS floor_number,f.name AS floor_name,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'category',e.category,'state',e.state)) FROM equipment e WHERE e.space_id=s.id),'[]') AS equipment,
  EXISTS(SELECT 1 FROM bookings b WHERE b.space_id=s.id AND b.status='active' AND b.starts_at<$2 AND b.ends_at>$1) AS occupied,
  EXISTS(SELECT 1 FROM availability_blocks a WHERE a.space_id=s.id AND a.released_at IS NULL AND a.starts_at<$2 AND a.ends_at>$1) AS blocked,
  (SELECT count(*)::int FROM tickets t WHERE t.space_id=s.id AND t.status IN ('new','in_progress')) AS open_tickets
  FROM spaces s JOIN floors f ON f.id=s.floor_id`;
@ApiTags('Spaces')
@ApiCookieAuth()
@Controller()
class SpacesController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get('site') async site() {
    const [site] = await this.db.query('SELECT * FROM sites LIMIT 1');
    return site;
  }
  @Get('floors') floors() {
    return this.db.query('SELECT * FROM floors ORDER BY number');
  }
  @Get('floors/:id/plan') async plan(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    uuid(id);
    const range = dateRange(query);
    const [floor] = await this.db.query('SELECT * FROM floors WHERE id=$1', [id]);
    if (!floor) fail(404, 'NOT_FOUND', 'Floor not found');
    return {
      floor,
      spaces: await this.db.query(
        spaceQuery + ' WHERE s.floor_id=$3 AND NOT s.archived ORDER BY s.name',
        [range.from, range.to, id],
      ),
    };
  }
  @Get('spaces') async spaces(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const range = dateRange(query);
    const p = pagination(query);
    const includeArchived = query.include_archived === 'true';
    if (includeArchived) manager(req.user);
    const filter = z
      .object({
        floor_id: z.string().uuid().optional(),
        type: z.enum(['room', 'desk']).optional(),
        capacity: z.coerce.number().int().min(1).max(100).default(1),
        search: z.string().max(100).default(''),
        equipment: z.string().max(60).optional(),
      })
      .parse(query);
    return this.db.query(
      spaceQuery +
        ` WHERE (NOT s.archived OR $10) AND ($3::uuid IS NULL OR s.floor_id=$3) AND ($4::text IS NULL OR s.type=$4)
      AND s.capacity >= $5 AND s.name ILIKE $6 AND ($7::text IS NULL OR EXISTS(SELECT 1 FROM equipment e WHERE e.space_id=s.id AND e.category=$7 AND e.state='working'))
      ORDER BY f.number,s.name LIMIT $8 OFFSET $9`,
      [
        range.from,
        range.to,
        filter.floor_id ?? null,
        filter.type ?? null,
        filter.capacity,
        '%' + filter.search + '%',
        filter.equipment ?? null,
        p.limit,
        p.offset,
        includeArchived,
      ],
    );
  }
  @Get('spaces/:id') async space(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
  ) {
    uuid(id);
    const range = dateRange(query);
    const [space] = await this.db.query(spaceQuery + ' WHERE s.id=$3', [range.from, range.to, id]);
    if (!space) fail(404, 'NOT_FOUND', 'Space not found');
    const schedule = await this.db.query(
      `SELECT b.id,b.starts_at,b.ends_at,b.status,b.needs_relocation,
      CASE WHEN b.user_id=$4 OR $5 THEN b.title ELSE 'Booked' END AS title,
      CASE WHEN b.user_id=$4 OR $5 THEN b.user_id ELSE NULL END AS user_id
      FROM bookings b WHERE b.space_id=$3 AND b.status='active' AND b.starts_at<$2 AND b.ends_at>$1 ORDER BY b.starts_at`,
      [range.from, range.to, id, req.user.id, req.user.role !== 'employee'],
    );
    const blocks = await this.db.query(
      'SELECT id,starts_at,ends_at,reason FROM availability_blocks WHERE space_id=$1 AND released_at IS NULL ORDER BY starts_at',
      [id],
    );
    return { ...space, schedule, blocks };
  }
  @Patch('spaces/:id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    uuid(id);
    const input = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        capacity: z.number().int().min(1).max(100).optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (q) => {
      const [space] = await q.query('SELECT * FROM spaces WHERE id=$1 FOR UPDATE', [id]);
      if (!space) fail(404, 'NOT_FOUND', 'Space not found');
      if (space.type === 'desk' && input.capacity && input.capacity !== 1)
        fail(400, 'CAPACITY', 'A desk has exactly one seat');
      if (input.archived || (input.capacity && input.capacity < space.capacity)) {
        const [{ exists }] = await q.query(
          "SELECT EXISTS(SELECT 1 FROM bookings WHERE space_id=$1 AND status='active' AND ends_at>now() AND ($2::boolean OR attendees>$3))",
          [id, !!input.archived, input.capacity ?? space.capacity],
        );
        if (exists) fail(409, 'ACTIVE_BOOKINGS', 'Cancel or relocate the affected bookings first');
      }
      const [updated] = await q.query(
        'UPDATE spaces SET name=COALESCE($2,name),capacity=COALESCE($3,capacity),archived=COALESCE($4,archived) WHERE id=$1 RETURNING *',
        [id, input.name ?? null, input.capacity ?? null, input.archived ?? null],
      );
      await this.audit.record(q, req.user.id, 'space.updated', 'space', id, input);
      return updated;
    });
  }
  @Post('spaces') async create(@Body() body: unknown, @Req() req: AuthRequest) {
    manager(req.user);
    const input = z
      .object({
        floor_id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        type: z.enum(['room', 'desk']),
        capacity: z.number().int().min(1).max(100),
        geometry: z.object({
          x: z.number().min(0).max(1000),
          y: z.number().min(0).max(620),
          width: z.number().min(20).max(1000),
          height: z.number().min(20).max(620),
        }),
      })
      .strict()
      .parse(body);
    if (input.type === 'desk' && input.capacity !== 1)
      fail(400, 'CAPACITY', 'A desk has exactly one seat');
    if (
      input.geometry.x + input.geometry.width > 1000 ||
      input.geometry.y + input.geometry.height > 620
    )
      fail(400, 'GEOMETRY', 'The space must fit within the floor plan');
    return this.db.transaction(async (q) => {
      const [floor] = await q.query('SELECT id FROM floors WHERE id=$1', [input.floor_id]);
      if (!floor) fail(404, 'NOT_FOUND', 'Floor not found');
      const [space] = await q.query(
        'INSERT INTO spaces(floor_id,name,type,capacity,geometry) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [input.floor_id, input.name, input.type, input.capacity, JSON.stringify(input.geometry)],
      );
      await this.audit.record(q, req.user.id, 'space.created', 'space', space.id, input);
      return space;
    });
  }
}
@Module({ controllers: [SpacesController] })
export class SpacesModule {}
