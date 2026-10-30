import 'reflect-metadata';
import { type LoggerService, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DriverGateway } from './driver.gateway.js';

@Module({ providers: [DriverGateway] })
class AppModule {}

export async function startServer(port: number, logger?: LoggerService | false) {
  const app = await NestFactory.create(AppModule, { logger });
  await app.listen(port);
  return app;
}
