import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class FakeAuthMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const userId = req.headers['x-user-id'];

        (req as any).user = {
            id: userId ? Number(userId) : null,
            role: 'user',
        };

        next();
    }
}