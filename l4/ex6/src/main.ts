import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  mkdirSync('./uploads/avatars', { recursive: true });
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log('Bai 6 running on http://localhost:3000');
}
bootstrap();
