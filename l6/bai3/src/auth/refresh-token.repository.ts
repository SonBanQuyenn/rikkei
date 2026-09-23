import { Injectable } from '@nestjs/common';
import { RefreshToken } from './refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  private tokens: RefreshToken[] = [];

  save(token: string, userId: number) {
    this.tokens.push({ token, userId });
  }

  find(token: string): RefreshToken | undefined {
    return this.tokens.find((t) => t.token === token);
  }

  remove(token: string) {
    this.tokens = this.tokens.filter((t) => t.token !== token);
  }
}
