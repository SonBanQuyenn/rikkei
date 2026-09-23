import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('Config folder:', app.get(ConfigService).getFolder());
  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
}
bootstrap();
