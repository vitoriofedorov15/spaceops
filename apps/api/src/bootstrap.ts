import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/error.filter';
import { describeApi } from './common/openapi';
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  // One trusted reverse proxy (nginx). Do not expose the API port publicly in production.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: any) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = process.env.PUBLIC_URL ?? 'http://localhost:5173';
      if (req.headers.origin !== allowed)
        return res.status(403).json({
          code: 'ORIGIN_REJECTED',
          message: 'Request origin is not allowed',
          details: null,
        });
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => process.env.NODE_ENV === 'test',
      message: {
        code: 'RATE_LIMIT',
        message: 'Too many sign-in attempts. Try again in 15 minutes.',
        details: null,
      },
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ErrorFilter());
  const config = new DocumentBuilder()
    .setTitle('SpaceOps API')
    .setDescription(
      'Cookie sessions. For mutations send Origin matching PUBLIC_URL and X-CSRF-Token from the spaceops_csrf cookie. All intervals are [start,end).',
    )
    .setVersion('1.0.0')
    .addCookieAuth('spaceops_session')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  SwaggerModule.setup('api/docs', app, describeApi(SwaggerModule.createDocument(app, config)));
  app.enableShutdownHooks();
  return app;
}
