import { Body, Controller, Get, Inject, Module, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthRequest } from '../auth/auth.module';
import { Database } from '../database/database.module';
import { Audit } from '../audit/audit.module';
import { fail, manager, pagination, uuid } from '../common/domain';
@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
class UsersController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get() async list(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    manager(req.user);
    const p = pagination(query);
    return this.db.query('SELECT id,name,email,role FROM users ORDER BY name LIMIT $1 OFFSET $2', [
      p.limit,
      p.offset,
    ]);
  }
  @Patch(':id/role') async role(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (req.user.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an administrator can change roles');
    const { role } = z
      .object({ role: z.enum(['employee', 'dispatcher', 'admin']) })
      .strict()
      .parse(body);
    uuid(id);
    return this.db.transaction(async (q) => {
      await q.query('SELECT pg_advisory_xact_lock(731904)');
      const [user] = await q.query('SELECT id,role FROM users WHERE id=$1 FOR UPDATE', [id]);
      if (!user) fail(404, 'NOT_FOUND', 'User not found');
      const [{ count }] = await q.query(
        "SELECT count(*)::int AS count FROM users WHERE role='admin'",
      );
      if (user.role === 'admin' && role !== 'admin' && count < 2)
        fail(409, 'LAST_ADMIN', 'The last administrator must keep the administrator role');
      const [updated] = await q.query(
        'UPDATE users SET role=$2 WHERE id=$1 RETURNING id,name,email,role',
        [id, role],
      );
      await this.audit.record(q, req.user.id, 'user.role_changed', 'user', id, {
        from: user.role,
        to: role,
      });
      return updated;
    });
  }
}
@Module({ controllers: [UsersController] })
export class UsersModule {}
