import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.usecase.js';
import { GetMeUseCase } from '../../application/use-cases/get-me.usecase.js';
import { LoginUseCase, type ClientContext } from '../../application/use-cases/login.usecase.js';
import { LogoutUseCase } from '../../application/use-cases/logout.usecase.js';
import { RefreshTokensUseCase } from '../../application/use-cases/refresh-tokens.usecase.js';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.usecase.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { TokenResponseDto, UserResponseDto } from '../dto/auth-response.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { LogoutDto } from '../dto/logout.dto.js';
import { RefreshDto } from '../dto/refresh.dto.js';
import { RegisterDto } from '../dto/register.dto.js';

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class ChangePasswordResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokensUseCase: RefreshTokensUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new account (default role: GUEST)' })
  @ApiCreatedResponse({ type: UserResponseDto })
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.registerUserUseCase.execute(dto).then(UserResponseDto.from);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair' })
  @ApiOkResponse({ type: TokenResponseDto })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<TokenResponseDto> {
    return this.loginUseCase.execute(dto, clientContext(request)).then(TokenResponseDto.from);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and mint a new token pair' })
  @ApiOkResponse({ type: TokenResponseDto })
  refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<TokenResponseDto> {
    return this.refreshTokensUseCase.execute(dto, clientContext(request)).then(TokenResponseDto.from);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the session family of the presented refresh token' })
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(@Body() dto: LogoutDto, @CurrentUser() principal: AuthPrincipal): Promise<LogoutResponseDto> {
    await this.logoutUseCase.execute(dto, principal.userId);
    return { success: true };
  }

  @Get('me')
  @SkipThrottle({ auth: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() principal: AuthPrincipal): Promise<UserResponseDto> {
    return this.getMeUseCase.execute(principal.userId).then(UserResponseDto.from);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the authenticated user password (invalidates all refresh tokens)' })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<ChangePasswordResponseDto> {
    await this.changePasswordUseCase.execute(dto, principal.userId);
    return { success: true };
  }
}

function clientContext(request: Request): ClientContext {
  const agent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    userAgent: typeof agent === 'string' && agent.length > 0 ? agent.slice(0, 512) : undefined,
  };
}
