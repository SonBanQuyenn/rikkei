import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OwnershipGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const user = (req as any).user;
        const resourceId = Number(req.params.id);

        if (!user || user.id !== resourceId) {
            throw new ForbiddenException(
                'Bạn không có quyền xóa bài viết của người khác',
            );
        }

        return true;
    }
}