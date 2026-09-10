// Must be imported before anything else in main.ts — Sentry needs to patch
// Node's internals (http, etc.) before the rest of the app creates any of
// its own instances of them.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  });
}
