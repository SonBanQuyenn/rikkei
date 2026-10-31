import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { Clock } from './shield/clock.js';
import { ShieldStore } from './shield/storage/shield-store.js';

export async function createApp(logger = true) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: logger ? undefined : false });
  // Chi tin X-Forwarded-For tu proxy noi bo (load balancer); demo chay tren loopback
  app.set('trust proxy', 'loopback');
  app.useGlobalFilters(new AllExceptionsFilter());

  const store = app.get(ShieldStore);
  const clock = app.get(Clock);
  setInterval(() => store.sweep(clock.now()), 60_000).unref();
  return app;
}

/** Luoi an toan cuoi cung: loi bat dong bo lot luoi chi ghi log, khong lam sap dich vu. */
export function installProcessGuards() {
  const logger = new Logger('Process');
  process.on('unhandledRejection', (reason) => logger.error(`unhandledRejection: ${String(reason)}`));
  process.on('uncaughtException', (err) => logger.error(`uncaughtException: ${err.stack ?? err.message}`));
}
