import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { FakeAuthMiddleware } from './middlewares/fake-auth.middleware';

@Module({
    controllers: [AppController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(FakeAuthMiddleware).forRoutes('*');
    }
}