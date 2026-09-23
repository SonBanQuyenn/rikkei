import { Injectable } from '@nestjs/common';

export interface User {
  id: number;
  email: string;
}

@Injectable()
export class UsersService {
  private users: User[] = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    email: `user${i + 1}@example.com`,
  }));

  findAll(page: number, limit: number) {
    const start = (page - 1) * limit;
    return this.users.slice(start, start + limit);
  }
}
