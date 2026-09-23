import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const BLACKLIST: string[] = ['::1', '127.0.0.1'];

@Injectable()
export class IpBlockMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const ip = req.ip;

        if (BLACKLIST.includes(ip)) {
            return res.status(403).send({
                success: false,
                message: `IP ${ip} đã bị chặn`,
            });
        }

        next();
    }
}