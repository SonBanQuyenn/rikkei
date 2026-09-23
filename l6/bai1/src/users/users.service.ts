import { Injectable } from '@nestjs/common';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [
    {
      id: 1,
      username: 'thanh',
      password: '123456',
      departmentId: 5,
      avatarUrl: 'https://example.com/avatar/thanh.png',
    },
  ];

  async findByUsername(username: string): Promise<User | undefined> {
    return this.users.find((u) => u.username === username);
  }
}
