import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { OrderController } from './order.controller.js';

/** Cau hinh dang chay tren moi truong that - giu nguyen de tai hien loi. */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 3 }]),
  ],
  // (khong dang ky ThrottlerGuard o pham vi toan ung dung)
  controllers: [OrderController, AuthController],
})
export class BuggyAppModule {}
