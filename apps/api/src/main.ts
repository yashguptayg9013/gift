import 'reflect-metadata';
import { loadEnv } from './config/env';

async function bootstrap() {
  const e = loadEnv();
  if (e.SENTRY_DSN) {
    // Optional error monitoring. Install @sentry/node and set SENTRY_DSN to enable.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');
      Sentry.init({ dsn: e.SENTRY_DSN, environment: e.NODE_ENV, tracesSampleRate: 0 });
    } catch {
      console.warn('SENTRY_DSN is set but @sentry/node is not installed; error monitoring disabled.');
    }
  }
  const { createApp } = await import('./app.factory');
  const app = await createApp();
  await app.listen(e.PORT, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
