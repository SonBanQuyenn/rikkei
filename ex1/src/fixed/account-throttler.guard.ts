import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Quy tac nghiep vu tinh theo TAI KHOAN, khong theo IP:
 * - bot doi IP lien tuc van bi dem chung mot tai khoan;
 * - nhieu khach that dung chung IP (NAT van phong, 4G) khong chan lan nhau.
 * Request chua dang nhap moi roi ve dem theo IP.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.headers['x-user-id'];
    return typeof userId === 'string' && userId ? `user:${userId}` : `ip:${req.ip}`;
  }
}
