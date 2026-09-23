import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = Number(req.headers['x-user-id']);
    const user = this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    req.user = user;
    return true;
  }
}
