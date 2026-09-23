import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DatabaseModule } from 'app/database';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
})
export class AdminModule {}
