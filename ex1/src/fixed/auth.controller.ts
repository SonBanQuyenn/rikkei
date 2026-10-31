import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SendOtpDto } from '../dto.js';

@Controller('auth')
export class AuthController {
  // Bo @SkipThrottle(); moi tin nhan ton phi nen chi 3 lan / 5 phut
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return { sent: true, phone: dto.phone };
  }
}
