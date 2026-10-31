import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { ApiController } from './api.controller.js';
import { Clock } from './quota/clock.js';
import { CounterStore } from './quota/counter.store.js';
import { MerchantStore } from './quota/merchant.store.js';
import { QuotaGuard } from './quota/quota.guard.js';
import { QuotaService } from './quota/quota.service.js';

@Module({
  controllers: [ApiController, AdminController],
  providers: [Clock, CounterStore, MerchantStore, QuotaService, QuotaGuard],
})
export class AppModule {}
