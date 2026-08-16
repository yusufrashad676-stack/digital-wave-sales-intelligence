import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'UNKNOWN'] as const;

export class SaveLeadDto {
  @ApiProperty({ example: 'mock' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  providerId!: string;

  @ApiProperty({ example: 'mock-restaurant-003' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  providerRecordId!: string;

  @ApiProperty({ example: 'مطعم أبو قير للمأكولات البحرية' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/, { message: 'companyName must not be blank' })
  companyName!: string;

  @ApiPropertyOptional({ example: 'restaurant' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  @ApiPropertyOptional({ example: 'سيدي بشر، طريق الجيش، الإسكندرية' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  address?: string;

  @ApiPropertyOptional({ example: 'سيدي بشر' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  area?: string;

  @ApiPropertyOptional({ example: '+20 3 540 2233' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({ example: 'hello@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: 'https://abuqir-seafood.example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: 4.3 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: 431 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ratingCount?: number;

  @ApiPropertyOptional({ example: 'UNVERIFIED', enum: VERIFICATION_STATUSES })
  @IsOptional()
  @IsEnum(VERIFICATION_STATUSES)
  verificationStatus?: string;

  @ApiPropertyOptional({ example: 'https://maps.example.com/place/mock-restaurant-003' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sourceUrl?: string;

  @ApiProperty({ example: '2026-08-15T10:00:00.000Z' })
  @IsISO8601()
  retrievedAt!: string;
}
