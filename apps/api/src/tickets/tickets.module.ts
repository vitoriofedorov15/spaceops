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
import { fail, manager, owner, pagination, uuid } from '../common/domain';
const createSchema = z
  .object({
    space_id: z.string().uuid(),
    equipment_id: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(3).max(5000),
    category: z.enum(['equipment', 'climate', 'cleaning', 'other']),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  })
  .strict();
@ApiTags('Tickets')
@ApiCookieAuth()
@Controller('tickets')
class TicketsController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get() list(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const p = pagination(query);
    const f = z
      .object({
        status: z.enum(['new', 'in_progress', 'resolved', 'closed']).optional(),
        space_id: z.string().uuid().optional(),
      })
      .parse(query);
    return this.db.query(
      `SELECT t.*,s.name AS space_name,u.name AS author_name,a.name AS assignee_name,e.name AS equipment_name FROM tickets t JOIN spaces s ON s.id=t.space_id JOIN users u ON u.id=t.author_id LEFT JOIN users a ON a.id=t.assignee_id LEFT JOIN equipment e ON e.id=t.equipment_id
      WHERE ($1 OR t.author_id=$2) AND ($3::text IS NULL OR t.status=$3) AND ($4::uuid IS NULL OR t.space_id=$4) ORDER BY t.created_at DESC LIMIT $5 OFFSET $6`,
      [
        req.user.role !== 'employee',
        req.user.id,
        f.status ?? null,
        f.space_id ?? null,
        p.limit,
        p.offset,
      ],
    );
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const input = createSchema.parse(body);
    return this.db.transaction(async (q) => {
      const [space] = await q.query('SELECT id FROM spaces WHERE id=$1 AND NOT archived', [
        input.space_id,
      ]);
      if (!space) fail(404, 'NOT_FOUND', 'Space not found');
      if (input.equipment_id) {
        const [eq] = await q.query('SELECT id FROM equipment WHERE id=$1 AND space_id=$2', [
          input.equipment_id,
          input.space_id,
        ]);
        if (!eq)
          fail(400, 'INVALID_EQUIPMENT', 'This equipment does not belong to the selected space');
      }
      const [ticket] = await q.query(
        'INSERT INTO tickets(space_id,equipment_id,author_id,title,description,category,priority) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          input.space_id,
          input.equipment_id ?? null,
          req.user.id,
          input.title,
          input.description,
          input.category,
          input.priority,
        ],
      );
      await this.audit.record(q, req.user.id, 'ticket.created', 'ticket', ticket.id);
      await this.audit.notifyManagers(q, 'ticket.created', 'New ticket: ' + input.title, ticket.id);
      return ticket;
    });
  }
  private async readable(id: string, req: AuthRequest) {
    const [ticket] = await this.db.query('SELECT * FROM tickets WHERE id=$1', [uuid(id)]);
    if (!ticket) fail(404, 'NOT_FOUND', 'Ticket not found');
    if (req.user.role === 'employee') owner(req.user, ticket.author_id);
    return ticket;
  }
  @Get(':id') async detail(@Param('id') id: string, @Req() req: AuthRequest) {
    const ticket = await this.readable(id, req);
    const comments = await this.db.query(
      'SELECT c.*,u.name AS author_name FROM ticket_comments c JOIN users u ON u.id=c.author_id WHERE c.ticket_id=$1 ORDER BY c.created_at LIMIT 100',
      [id],
    );
    const history = await this.db.query(
      "SELECT a.id,a.action,a.changes,a.created_at,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity_type='ticket' AND a.entity_id=$1 ORDER BY a.created_at LIMIT 100",
      [id],
    );
    return { ...ticket, comments, history };
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    manager(req.user);
    uuid(id);
    const input = z
      .object({
        status: z.enum(['new', 'in_progress', 'resolved', 'closed']).optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        comment: z.string().trim().min(3).max(3000).optional(),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (q) => {
      const [ticket] = await q.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE', [id]);
      if (!ticket) fail(404, 'NOT_FOUND', 'Ticket not found');
      const status = input.status ?? ticket.status;
      const allowed: Record<string, string[]> = {
        new: ['new', 'in_progress'],
        in_progress: ['in_progress', 'resolved'],
        resolved: ['resolved', 'closed'],
        closed: ['closed', 'in_progress'],
      };
      if (!allowed[ticket.status].includes(status))
        fail(400, 'INVALID_TRANSITION', 'This status transition is not allowed');
      if (ticket.status === 'closed' && status === 'in_progress' && !input.comment)
        fail(400, 'COMMENT_REQUIRED', 'Add a comment to reopen the ticket');
      const assignee = input.assignee_id === undefined ? ticket.assignee_id : input.assignee_id;
      if (assignee) {
        const [u] = await q.query(
          "SELECT id FROM users WHERE id=$1 AND role IN ('dispatcher','admin')",
          [assignee],
        );
        if (!u) fail(400, 'INVALID_ASSIGNEE', 'The assignee must be a dispatcher or administrator');
      }
      if (status === 'in_progress' && !assignee)
        fail(400, 'ASSIGNEE_REQUIRED', 'Assign someone to the ticket');
      const [updated] = await q.query(
        `UPDATE tickets SET status=$2,assignee_id=$3,resolved_at=CASE WHEN $2='resolved' AND status<>'resolved' THEN now() WHEN $2='in_progress' THEN NULL ELSE resolved_at END WHERE id=$1 RETURNING *`,
        [id, status, assignee],
      );
      if (input.comment)
        await q.query('INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES($1,$2,$3)', [
          id,
          req.user.id,
          input.comment,
        ]);
      await this.audit.record(q, req.user.id, 'ticket.updated', 'ticket', id, {
        from: ticket.status,
        to: status,
        assignee_id: assignee,
      });
      await this.audit.notify(
        q,
        ticket.author_id,
        'ticket.updated',
        'Ticket updated: ' + ticket.title,
        id,
      );
      return updated;
    });
  }
  @Post(':id/comments') async comment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.readable(id, req);
    const { body: text } = z
      .object({ body: z.string().trim().min(1).max(3000) })
      .strict()
      .parse(body);
    return this.db.transaction(async (q) => {
      const [comment] = await q.query(
        'INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES($1,$2,$3) RETURNING *',
        [id, req.user.id, text],
      );
      await this.audit.record(q, req.user.id, 'ticket.commented', 'ticket', id);
      return comment;
    });
  }
}
@Module({ controllers: [TicketsController] })
export class TicketsModule {}
