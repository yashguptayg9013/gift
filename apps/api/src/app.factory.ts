import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { env } from './config/env';
import { RequestContextStore } from './common/request-context';

/** Shared by main.ts and integration tests so both run the exact same pipeline. */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, logger: opts.logger === false ? false : undefined });
  if (opts.logger !== false) app.useLogger(app.get(Logger));
  configureApp(app);
  return app;
}

export function configureApp(app: INestApplication) {
  const e = env();
  const express = app.getHttpAdapter().getInstance();
  if (e.TRUST_PROXY > 0) express.set('trust proxy', e.TRUST_PROXY);
  express.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    RequestContextStore.run({ requestId, ip: req.ip, userAgent: req.headers['user-agent'] }, () => next());
  });
  app.use(helmet({ contentSecurityPolicy: e.NODE_ENV === 'production' ? undefined : false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
    exposedHeaders: ['x-request-id', 'content-disposition'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (e.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('PUJA OS API')
      .setDescription('Manufacturing operating system REST API. All quantities are in the item base unit unless stated.')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('puja_at')
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs/openapi.json' });
  }
}
