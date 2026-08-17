import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class EnrichRequestDto {
  @ApiProperty({ required: false, description: 'Skip website enrichment' })
  @IsOptional()
  @IsBoolean()
  skipWebsite?: boolean;

  @ApiProperty({ required: false, description: 'Skip social discovery' })
  @IsOptional()
  @IsBoolean()
  skipSocial?: boolean;

  @ApiProperty({ required: false, description: 'Max concurrent enrichments', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  concurrency?: number;

  @ApiProperty({ required: false, description: 'Max retries per result', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxRetries?: number;
}
