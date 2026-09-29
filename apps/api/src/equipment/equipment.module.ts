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
import { Database } from '../database/database.module';
import { Audit } from '../audit/audit.module';
import { AuthRequest } from '../auth/auth.module';
import { fail, manager, pagination, uuid } from '../common/domain';
const equipmentSchema = z
  .object({
    space_id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    inventory_number: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(60),
    state: z.enum(['working', 'broken', 'repair']).default('working'),
  })
  .strict();
@ApiTags('Equipment')
@ApiCookieAuth()
@Controller('equipment')
class EquipmentController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get() list(@Query() query: Record<string, string>) {
    const p = pagination(query);
    const f = z
      .object({
        search: z.string().max(100).default(''),
        state: z.enum(['working', 'broken', 'repair']).optional(),
        space_id: z.string().uuid().optional(),
        category: z.string().max(60).optional(),
      })
      .parse(query);
    return this.db.query(
      `SELECT e.*,s.name AS space_name,f.number AS floor_number FROM equipment e JOIN spaces s ON s.id=e.space_id JOIN floors f ON f.id=s.floor_id
      WHERE (e.name ILIKE $1 OR e.inventory_number ILIKE $1) AND ($2::text IS NULL OR e.state=$2) AND ($3::uuid IS NULL OR e.space_id=$3) AND ($4::text IS NULL OR e.category=$4)
      ORDER BY e.inventory_number LIMIT $5 OFFSET $6`,
      [
        '%' + f.search + '%',
        f.state ?? null,
        f.space_id ?? null,
        f.category ?? null,
        p.limit,
        p.offset,
      ],
    );
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    manager(req.user);
    const input = equipmentSchema.parse(body);
    return this.db.transaction(async (q) => {
      const [space] = await q.query(
        'SELECT id FROM spaces WHERE id=$1 AND NOT archived FOR UPDATE',
        [input.space_id],
      );
      if (!space) fail(404, 'NOT_FOUND', 'Space not found');
      const [eq] = await q.query(
        'INSERT INTO equipment(space_id,name,inventory_number,category,state) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [input.space_id, input.name, input.inventory_number, input.category, input.state],
      );
      await this.audit.record(q, req.user.id, 'equipment.created', 'equipment', eq.id, input);
      return eq;
    });
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    uuid(id);
    const input = equipmentSchema.omit({ space_id: true }).partial().strict().parse(body);
    const [snapshot] = await this.db.query('SELECT space_id FROM equipment WHERE id=$1', [id]);
    if (!snapshot) fail(404, 'NOT_FOUND', 'No equipment found');
    return this.db.transaction(async (q) => {
      await q.query('SELECT id FROM spaces WHERE id=$1 FOR UPDATE', [snapshot.space_id]);
      const [eq] = await q.query(
        'UPDATE equipment SET name=COALESCE($2,name),inventory_number=COALESCE($3,inventory_number),category=COALESCE($4,category),state=COALESCE($5,state) WHERE id=$1 RETURNING *',
        [
          id,
          input.name ?? null,
          input.inventory_number ?? null,
          input.category ?? null,
          input.state ?? null,
        ],
      );
      await this.audit.record(q, req.user.id, 'equipment.updated', 'equipment', id, input);
      return eq;
    });
  }
}
@Module({ controllers: [EquipmentController] })
export class EquipmentModule {}
