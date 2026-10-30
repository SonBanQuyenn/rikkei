import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DASHBOARD_CONFIG, DEFAULT_CONFIG, type DashboardConfig } from './config.js';
import { DashboardController } from './dashboard.controller.js';
import { MetricsService } from './metrics.service.js';
import { SimulatorService } from './simulator.service.js';

export async function createApp(overrides: Partial<DashboardConfig> = {}, logger = true) {
  @Module({
    controllers: [DashboardController],
    providers: [
      { provide: DASHBOARD_CONFIG, useValue: { ...DEFAULT_CONFIG, ...overrides } },
      MetricsService,
      SimulatorService,
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: logger ? undefined : false });
  app.enableShutdownHooks();
  return app;
}
