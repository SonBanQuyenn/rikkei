import { Injectable } from '@nestjs/common';

@Injectable()
export class BlacklistService {
  private blacklist = new Set<string>();

  add(token: string) {
    this.blacklist.add(token);
  }

  isBlacklisted(token: string): boolean {
    return this.blacklist.has(token);
  }
}
