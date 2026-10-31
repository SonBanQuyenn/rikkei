import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConnection } from './config/redis.config.js';
import { errorMessage, type Logger } from './common/logger.js';
import { ControlCenter, type ControlCenterOptions } from './queues/control-center.js';
import { LogNotifier, MemoryNotifier, WebhookNotifier, type AlertNotifier } from './monitoring/notifiers.js';
import { DashboardModule } from './http/dashboard.module.js';
import type { Ports } from './tasks/ports.js';

export type System = { center: ControlCenter; app: INestApplication; history: MemoryNotifier; redis: Redis; shutdown(): Promise<void> };

/** Lap rap toan bo he thong: Redis, trung tam dieu hanh, cac kenh canh bao, HTTP bang dieu khien. */
export async function startSystem(params: {
  ns: string;
  port: number;
  ports: Ports;
  logger: Logger;
  overrides?: Partial<Pick<ControlCenterOptions, 'queues' | 'schedules' | 'monitor'>>;
  extraNotifiers?: AlertNotifier[];
}): Promise<System> {
  const redis = new Redis(redisConnection);
  redis.on('error', (err) => params.logger.error(`Redis: ${err.message}`)); // mat ket noi -> ioredis tu noi lai

  const history = new MemoryNotifier();
  const notifiers: AlertNotifier[] = [new LogNotifier(params.logger), history, ...(params.extraNotifiers ?? [])];
  if (process.env.ALERT_WEBHOOK_URL) notifiers.push(new WebhookNotifier(process.env.ALERT_WEBHOOK_URL, params.logger));

  const center = new ControlCenter({
    connection: redisConnection,
    redis,
    ns: params.ns,
    ports: params.ports,
    notifiers,
    logger: params.logger,
    ...params.overrides,
  });
  await center.start();

  const app = await NestFactory.create(DashboardModule.register(center, history), { logger: ['error', 'warn'] });
  await app.listen(params.port);

  let closing = false;
  return {
    center,
    app,
    history,
    redis,
    async shutdown() {
      if (closing) return;
      closing = true;
      await app.close().catch((e) => params.logger.error(errorMessage(e)));
      await center.close();
      await redis.quit().catch(() => {});
    },
  };
}

/** Khong de loi lot luoi lam sap tien trinh: ghi log; loi dong bo khong bat duoc thi tat co trat tu. */
export function installProcessGuards(logger: Logger, shutdown: () => Promise<void>) {
  process.on('unhandledRejection', (reason) => logger.error(`Promise bi tu choi khong duoc xu ly: ${errorMessage(reason)}`));
  process.on('uncaughtException', (err) => {
    logger.error(`Loi khong bat duoc: ${err.stack ?? err.message} -> tat co trat tu`);
    void shutdown().finally(() => process.exit(1));
  });
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      logger.info(`Nhan ${sig}, dang tat...`);
      void shutdown().finally(() => process.exit(0));
    });
  }
}
