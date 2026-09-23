import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [ConfigModule.forRoot({ folder: 'production' })],
})
export class AppModule {}
