import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { APP_CONFIG, appConfig } from './config.constants';

@Module({
  controllers: [AppController],
  providers: [
    {
      provide: APP_CONFIG,
      useValue: appConfig,
    },
  ],
})
export class AppModule {}
