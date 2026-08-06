import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Account email address (lowercased on registration)', example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: 'Password (hashed with argon2id before persistence)',
    example: 'correct-horse-battery-staple',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Display name', example: 'Ada Lovelace' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;
}
