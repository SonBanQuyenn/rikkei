import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from 'app/database';

@Controller()
export class AppController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  getStatus(): string {
    return this.databaseService.connect();
  }
}
