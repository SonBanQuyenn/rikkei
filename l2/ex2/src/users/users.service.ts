import { Injectable } from '@nestjs/common';
import { LoggerService } from '../core/logger.service';
import { DatabaseService } from '../core/database.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly logger: LoggerService,
    private readonly database: DatabaseService,
  ) {}

  listUsers() {
    this.logger.log('Listing users');
    this.database.connect();
    return ['user1', 'user2'];
  }
}
