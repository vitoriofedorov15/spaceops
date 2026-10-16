import { Controller, Get, Inject, Module, Param, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Database } from '../database/database.module';
import { AuthRequest } from '../auth/auth.module';
import { fail, pagination, uuid } from '../common/domain';
@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
class NotificationsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    const p = pagination(query);
    const [{ unread }] = await this.db.query(
      'SELECT count(*)::int AS unread FROM notifications WHERE user_id=$1 AND read_at IS NULL',
      [req.user.id],
    );
    return {
      unread,
      items: await this.db.query(
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user.id, p.limit, p.offset],
      ),
    };
  }
  @Post('read-all') async readAll(@Req() req: AuthRequest) {
    await this.db.query(
      'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',
      [req.user.id],
    );
    return { ok: true };
  }
  @Post(':id/read') async read(@Param('id') id: string, @Req() req: AuthRequest) {
    const [n] = await this.db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',
      [uuid(id), req.user.id],
    );
    if (!n) fail(404, 'NOT_FOUND', 'Notification not found');
    return { ok: true };
  }
}
@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
