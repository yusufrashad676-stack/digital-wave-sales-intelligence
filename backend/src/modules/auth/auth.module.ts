import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtAlgorithm } from '../../config/configuration.js';
import { ChangePasswordUseCase } from './application/use-cases/change-password.usecase.js';
import { RegisterUserUseCase } from './application/use-cases/register-user.usecase.js';
import { LoginUseCase } from './application/use-cases/login.usecase.js';
import { RefreshTokensUseCase } from './application/use-cases/refresh-tokens.usecase.js';
import { LogoutUseCase } from './application/use-cases/logout.usecase.js';
import { GetMeUseCase } from './application/use-cases/get-me.usecase.js';
import { AuthRepository } from './domain/ports/auth.repository.js';
import { AuditPort } from './domain/ports/audit.port.js';
import { PasswordHasherPort } from './domain/ports/password-hasher.port.js';
import { RefreshTokenRepository } from './domain/ports/refresh-token.repository.js';
import { TokenPort } from './domain/ports/token.port.js';
import { Argon2PasswordHasher } from './infrastructure/adapters/argon2-password-hasher.adapter.js';
import { JwtTokenAdapter } from './infrastructure/adapters/jwt-token.adapter.js';
import { PrismaAuditAdapter } from './infrastructure/adapters/prisma-audit.adapter.js';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/repositories/prisma-refresh-token.repository.js';
import { AuthController } from './presentation/controllers/auth.controller.js';
import { AuthGuard } from './presentation/guards/auth.guard.js';
import { RolesGuard } from './presentation/guards/roles.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        signOptions: { algorithm: config.getOrThrow<JwtAlgorithm>('auth.jwt.algorithm') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: TokenPort, useClass: JwtTokenAdapter },
    { provide: PasswordHasherPort, useClass: Argon2PasswordHasher },
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
    { provide: AuditPort, useClass: PrismaAuditAdapter },
    RegisterUserUseCase,
    LoginUseCase,
    RefreshTokensUseCase,
    LogoutUseCase,
    GetMeUseCase,
    ChangePasswordUseCase,
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthGuard, RolesGuard, TokenPort],
})
export class AuthModule {}
