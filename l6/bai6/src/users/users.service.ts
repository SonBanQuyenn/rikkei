import { Injectable } from '@nestjs/common';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [
    { id: 1, username: 'user_a' },
    { id: 2, username: 'user_b' },
  ];

  findById(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}
