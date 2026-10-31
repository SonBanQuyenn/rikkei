import { Module } from '@nestjs/common';
import { ShieldAdminController } from './admin/shield-admin.controller.js';
import { ShieldModule } from './shield/shield.module.js';
import { ShopController } from './shop/shop.controller.js';
import { ShopService } from './shop/shop.service.js';

@Module({
  imports: [ShieldModule],
  controllers: [ShopController, ShieldAdminController],
  providers: [ShopService],
})
export class AppModule {}
