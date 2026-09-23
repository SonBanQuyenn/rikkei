import { Module } from '@nestjs/common';
import { ExternalModule } from './external/external.module';

@Module({
  imports: [ExternalModule],
})
export class AppModule {}
