import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from 'app/database';

@Controller()
export class AdminController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  getStatus(): string {
    return this.databaseService.connect();
  }
}
