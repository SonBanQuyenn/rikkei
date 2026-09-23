import { Module } from '@nestjs/common';
import { SalariesController } from './salaries.controller';
import { SalariesService } from './salaries.service';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { CurrentUserGuard } from '../casl/current-user.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [SalariesController],
  providers: [SalariesService, CaslAbilityFactory, CurrentUserGuard],
})
export class SalariesModule {}
