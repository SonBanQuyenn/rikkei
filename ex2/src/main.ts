import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { HARD_EXIT_MS } from './config/queue.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // (1) Bat che do lang nghe tin hieu tat ung dung: SIGTERM (k8s/docker stop) va SIGINT (Ctrl+C)
  //     -> Nest goi app.close() va chay cac hook onModuleDestroy/onApplicationShutdown.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  // Luoi an toan: neu vi bat ky ly do gi viec don dep van chua xong thi tu thoat, khong treo vinh vien.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      Logger.log(`Nhan ${signal}`, 'Shutdown');
      setTimeout(() => {
        Logger.error(`Don dep qua ${HARD_EXIT_MS} ms - buoc thoat`, 'Shutdown');
        process.exit(1);
      }, HARD_EXIT_MS).unref();
    });
  }

  await app.listen(Number(process.env.PORT ?? 3000));
  Logger.log(`Worker san sang (pid ${process.pid})`, 'Bootstrap');
}
bootstrap();
