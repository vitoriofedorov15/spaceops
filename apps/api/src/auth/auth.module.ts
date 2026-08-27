import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Database } from '../database/database.module';
import { fail, User } from '../common/domain';
export interface AuthRequest extends Request {
  user: User;
  sessionId: string;
}
export const Public = () => SetMetadata('public', true);
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [context.getHandler(), context.getClass()]))
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.spaceops_session;
    if (typeof token !== 'string' || token.length > 200)
      fail(401, 'UNAUTHORIZED', 'Sign in to your account');
    const [session] = await this.db.query(
      'SELECT s.id AS session_id,s.csrf_hash,u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [digest(token)],
    );
    if (!session) fail(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.get('x-csrf-token');
      if (!csrf || csrf.length > 200 || digest(csrf) !== session.csrf_hash)
        fail(403, 'CSRF', 'Refresh the page and try again');
    }
    req.user = { id: session.id, name: session.name, email: session.email, role: session.role };
    req.sessionId = session.session_id;
    return true;
  }
}
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private dummy = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  constructor(@Inject(Database) private db: Database) {}
  @Public()
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
      },
    },
  })
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .max(200)
          .transform((s) => s.toLowerCase()),
        password: z.string().min(1).max(200),
      })
      .strict()
      .parse(body);
    const [user] = await this.db.query('SELECT * FROM users WHERE email=$1', [input.email]);
    const valid = await argon2.verify(user?.password_hash ?? (await this.dummy), input.password);
    if (!user || !valid) fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    await this.db.transaction(async (q) => {
      await q.query('DELETE FROM sessions WHERE expires_at<now()');
      await q.query(
        "INSERT INTO sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
        [user.id, digest(token), digest(csrf)],
      );
    });
    const options = {
      sameSite: 'strict' as const,
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 7 * 86400000,
    };
    res.cookie('spaceops_session', token, { ...options, httpOnly: true });
    res.cookie('spaceops_csrf', csrf, { ...options, httpOnly: false });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
  @ApiCookieAuth() @Get('me') me(@Req() req: AuthRequest) {
    return req.user;
  }
  @ApiCookieAuth() @Post('logout') async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.query('DELETE FROM sessions WHERE id=$1', [req.sessionId]);
    res.clearCookie('spaceops_session', { path: '/' });
    res.clearCookie('spaceops_csrf', { path: '/' });
    return { ok: true };
  }
}
@Global()
@Module({
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AuthModule {}
