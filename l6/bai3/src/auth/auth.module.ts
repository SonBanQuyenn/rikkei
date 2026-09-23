import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from './refresh-token.repository';

@Module({
  imports: [
    JwtModule.register({
      secret: 'secretKey',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsersService, RefreshTokenRepository],
})
export class AuthModule {}
