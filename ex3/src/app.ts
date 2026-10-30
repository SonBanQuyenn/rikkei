import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ChatGateway } from './chat/chat.gateway.js';
import { ChatService } from './chat/chat.service.js';

@Module({ providers: [ChatService, ChatGateway] })
class AppModule {}

export async function startServer(port: number, logger = true) {
  const app = await NestFactory.create(AppModule, { logger: logger ? undefined : false });
  await app.listen(port);
  return app;
}
