import { Body, Controller, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SendOtpDto } from '../dto.js';

@Controller('auth')
export class AuthController {
  @SkipThrottle()
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return { sent: true, phone: dto.phone };
  }
}
