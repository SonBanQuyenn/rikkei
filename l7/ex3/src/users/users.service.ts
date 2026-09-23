import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export interface User {
  id: number;
  email: string;
  password: string;
}

@Injectable()
export class UsersService {
  private users: User[] = [
    {
      id: 1,
      email: 'test@example.com',
      password: bcrypt.hashSync('123456', 10),
    },
  ];

  findByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email);
  }
}
