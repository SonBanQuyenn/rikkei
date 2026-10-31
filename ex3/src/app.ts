import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Clock } from './quota/clock.js';
import { CounterStore } from './quota/counter.store.js';

export async function createApp(logger = true) {
  const app = await NestFactory.create(AppModule, { logger: logger ? undefined : false });
  // Don cac bo dem da het han de bo nho khong phinh theo thoi gian
  const counters = app.get(CounterStore);
  const clock = app.get(Clock);
  const timer = setInterval(() => counters.sweep(clock.now()), 60_000);
  timer.unref();
  return app;
}
