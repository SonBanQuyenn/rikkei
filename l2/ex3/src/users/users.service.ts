import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  checkPassword(username: string, password: string) {
    return password === '123456';
  }

  login(username: string, password: string) {
    return this.authService.generateToken(username, password);
  }
}
