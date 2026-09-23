import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request } from 'express';

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 10;

@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly store = new Map<string, RateLimitEntry>();

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const ip = req.ip || 'unknown';
        const now = Date.now();

        const entry = this.store.get(ip);

        if (!entry || now > entry.resetTime) {
            this.store.set(ip, {
                count: 1,
                resetTime: now + WINDOW_MS,
            });
            return true;
        }

        if (entry.count >= MAX_REQUESTS) {
            throw new HttpException(
                {
                    statusCode: 429,
                    message: 'Quá nhiều request, vui lòng thử lại sau 1 phút',
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        entry.count += 1;
        return true;
    }
}