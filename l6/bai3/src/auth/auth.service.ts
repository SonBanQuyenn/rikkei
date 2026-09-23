import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || user.password !== password) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(user.id, user.username);
  }

  async refresh(refreshToken: string) {
    const stored = this.refreshTokenRepository.find(refreshToken);
    if (!stored) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    this.refreshTokenRepository.remove(refreshToken);

    return this.issueTokens(user.id, user.username);
  }

  private issueTokens(userId: number, username: string) {
    const access_token = this.jwtService.sign(
      { sub: userId, username },
      { expiresIn: '15m' },
    );

    const refresh_token = uuidv4();
    this.refreshTokenRepository.save(refresh_token, userId);

    return { access_token, refresh_token };
  }
}
