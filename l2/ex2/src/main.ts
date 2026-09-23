import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { ProductsService } from './products/products.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.get(UsersService).listUsers();
  app.get(ProductsService).listProducts();
  console.log('Application started successfully');
}
bootstrap();
