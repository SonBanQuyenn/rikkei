import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { BlacklistService } from './blacklist.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private blacklistService: BlacklistService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || user.password !== password) {
      throw new UnauthorizedException();
    }

    const access_token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });

    return { access_token };
  }

  logout(token: string) {
    this.blacklistService.add(token);
    return { message: 'Logged out' };
  }
}
