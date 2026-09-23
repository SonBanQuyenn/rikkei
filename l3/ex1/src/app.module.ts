import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { IpBlockMiddleware } from './middlewares/ipBlock.middleware';

@Module({
    controllers: [AppController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(IpBlockMiddleware).forRoutes('*');
    }
}