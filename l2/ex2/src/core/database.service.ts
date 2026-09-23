import { Injectable } from '@nestjs/common';

@Injectable()
export class DatabaseService {
  connect() {
    return 'Database connected';
  }
}
