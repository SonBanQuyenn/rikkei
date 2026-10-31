import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountThrottlerGuard } from './account-throttler.guard.js';
import { AuthController } from './auth.controller.js';
import { OrderController } from './order.controller.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
  controllers: [OrderController, AuthController],
  // Kich hoat bo bao ve cho TOAN BO ung dung - thieu dong nay thi forRoot chi la cau hinh "chet"
  providers: [{ provide: APP_GUARD, useClass: AccountThrottlerGuard }],
})
export class AppModule {}
