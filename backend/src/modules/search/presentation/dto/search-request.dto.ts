import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SearchRequestDto {
  @ApiProperty({ example: 'عيادات في التجمع', description: 'Free-text business search query' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/, { message: 'query must not be blank' })
  query!: string;

  @ApiPropertyOptional({ example: 'Cairo', description: 'Fixed governorate filter' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  governorate?: string;

  @ApiPropertyOptional({ example: 'clinic', description: 'Fixed business category filter' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 4, description: 'Minimum rating between 0 and 5' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: false, description: 'Only return verified businesses' })
  @IsOptional()
  @IsBoolean()
  verifiedOnly?: boolean;
}
