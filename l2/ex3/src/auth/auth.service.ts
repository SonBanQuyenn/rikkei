import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  generateToken(username: string, password: string) {
    const valid = this.usersService.checkPassword(username, password);
    return valid ? `token-for-${username}` : null;
  }
}
