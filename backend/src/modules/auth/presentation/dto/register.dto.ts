import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Account email address (lowercased on registration)', example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description:
      'Password (hashed with argon2id before persistence). Must be at least 8 characters with uppercase, lowercase, digit, and special character.',
    example: 'N3w-S3cur3!Pass',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
  })
  password!: string;

  @ApiProperty({ description: 'Display name', example: 'Ada Lovelace' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;
}
