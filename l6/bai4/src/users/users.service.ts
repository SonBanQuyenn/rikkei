import { Injectable } from '@nestjs/common';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [
    new User({ id: 1, username: 'thanh', password: '123456' }),
  ];

  findAll(): User[] {
    return this.users;
  }

  findById(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}
