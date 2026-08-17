import { ApiProperty } from '@nestjs/swagger';
import type { EnrichmentRunResult } from '../../application/use-cases/enrich-search-results.usecase.js';

export class EnrichSummaryDto {
  @ApiProperty({ example: 14 })
  total!: number;

  @ApiProperty({ example: 10 })
  enriched!: number;

  @ApiProperty({ example: 2 })
  partiallyEnriched!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 1 })
  skipped!: number;

  @ApiProperty({ example: 8 })
  websiteFound!: number;

  @ApiProperty({ example: 12 })
  socialProfilesFound!: number;

  @ApiProperty({ example: 10 })
  socialProfilesVerified!: number;
}

export class EnrichResponseDto {
  @ApiProperty({ example: 'execution-uuid' })
  executionId!: string;

  @ApiProperty({ example: 'COMPLETED', enum: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'] })
  status!: string;

  @ApiProperty({ type: EnrichSummaryDto })
  summary!: EnrichSummaryDto;

  @ApiProperty({ example: 5432 })
  durationMs!: number;

  static from(result: EnrichmentRunResult): EnrichResponseDto {
    const dto = new EnrichResponseDto();
    dto.executionId = result.executionId;
    dto.status = result.status;
    dto.summary = result.summary;
    dto.durationMs = result.durationMs;
    return dto;
  }
}
