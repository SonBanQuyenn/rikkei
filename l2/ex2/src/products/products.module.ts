import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ProductsService } from './products.service';

@Module({
  imports: [CoreModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
