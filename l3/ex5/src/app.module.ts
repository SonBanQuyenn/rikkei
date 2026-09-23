import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Module({
    controllers: [AppController],
    providers: [
        {
            provide: APP_GUARD,
            useClass: RateLimitGuard,
        },
    ],
})
export class AppModule { }