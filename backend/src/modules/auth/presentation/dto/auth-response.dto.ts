import { ApiProperty } from '@nestjs/swagger';
import type { TokenPair } from '../../domain/entities/token-pair.entity.js';
import type { UserProfile } from '../../domain/entities/refresh-token-record.entity.js';

export class TokenResponseDto {
  @ApiProperty({ description: 'Short-lived access token (Bearer)' })
  accessToken!: string;

  @ApiProperty({ description: 'One-time use refresh token (rotated on every refresh)' })
  refreshToken!: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;

  static from(pair: TokenPair): TokenResponseDto {
    const dto = new TokenResponseDto();
    dto.accessToken = pair.accessToken;
    dto.refreshToken = pair.refreshToken;
    dto.tokenType = pair.tokenType;
    dto.expiresIn = pair.expiresIn;
    return dto;
  }
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ type: [String], example: ['GUEST'] })
  roles!: string[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  static from(profile: UserProfile): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = profile.id;
    dto.email = profile.email;
    dto.displayName = profile.displayName;
    dto.status = profile.status;
    dto.roles = profile.roles;
    dto.lastLoginAt = profile.lastLoginAt === null ? null : profile.lastLoginAt.toISOString();
    dto.createdAt = profile.createdAt.toISOString();
    return dto;
  }
}
