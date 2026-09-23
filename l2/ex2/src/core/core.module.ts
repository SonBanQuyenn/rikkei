import { Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { DatabaseService } from './database.service';

@Module({
  providers: [LoggerService, DatabaseService],
  exports: [LoggerService, DatabaseService],
})
export class CoreModule {}
