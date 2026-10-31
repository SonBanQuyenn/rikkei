import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`POST http://localhost:${port}/orders  body {"email":"a@shopfast.vn","items":[{"sku":"A","qty":1}]}`);
}
bootstrap();
