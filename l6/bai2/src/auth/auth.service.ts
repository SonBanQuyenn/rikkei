import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async register(username: string, password: string) {
    const hashed = await argon2.hash(password);
    const user = await this.usersService.create(username, hashed);
    return { id: user.id, username: user.username };
  }

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException();
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      throw new UnauthorizedException();
    }

    return { message: 'Login success', username: user.username };
  }
}
