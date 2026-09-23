import { Module } from '@nestjs/common';
import { SalariesModule } from './salaries/salaries.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [UsersModule, SalariesModule],
})
export class AppModule {}
