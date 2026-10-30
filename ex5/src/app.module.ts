import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from './auth/auth.service.js';
import { DEFAULT_CONFIG, DISPATCH_CONFIG, type DispatchConfig } from './config.js';
import { DispatchService } from './domain/dispatch.service.js';
import { DomainEvents } from './domain/domain-events.js';
import { DriverService } from './domain/driver.service.js';
import { MonitorService } from './domain/monitor.service.js';
import { OrderService } from './domain/order.service.js';
import { DispatchGateway } from './gateway/dispatch.gateway.js';

@Module({})
export class AppModule {
  static forRoot(overrides: Partial<DispatchConfig> = {}): DynamicModule {
    return {
      module: AppModule,
      providers: [
        { provide: DISPATCH_CONFIG, useValue: { ...DEFAULT_CONFIG, ...overrides } },
        AuthService,
        // Tang nghiep vu
        DomainEvents,
        OrderService,
        DriverService,
        DispatchService,
        MonitorService,
        // Tang realtime
        DispatchGateway,
      ],
    };
  }
}

export async function startServer(port: number, overrides: Partial<DispatchConfig> = {}, logger = true) {
  const app = await NestFactory.create(AppModule.forRoot(overrides), { logger: logger ? undefined : false });
  app.enableShutdownHooks();
  await app.listen(port);
  return app;
}
