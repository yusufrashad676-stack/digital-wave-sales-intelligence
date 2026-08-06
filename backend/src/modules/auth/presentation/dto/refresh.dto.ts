import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token returned by login/refresh (one-time use, rotated)' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
