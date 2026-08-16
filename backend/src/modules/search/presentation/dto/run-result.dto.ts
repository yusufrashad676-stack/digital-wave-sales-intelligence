import { ApiProperty } from '@nestjs/swagger';
import type { DiscoveryRunResult, QualifiedResult } from '../../domain/entities/discovery-run.js';
import type { SearchIntent } from '../../domain/entities/search-intent.js';

export class ResultQualificationDto {
  @ApiProperty({ example: 'QUALIFIED', enum: ['QUALIFIED', 'UNVERIFIED_SOCIAL', 'REJECTED'] })
  status!: string;

  @ApiProperty({ example: 'All discovery-level criteria satisfied' })
  reason!: string;

  @ApiProperty({ example: { requested: 'ABSENT', observed: 'ABSENT', source: 'google-places' } })
  website!: { requested: string; observed: string; source: string | null };

  @ApiProperty({ example: { requested: 'PRESENT', observed: 'UNKNOWN', source: null } })
  social!: { requested: string; observed: string; source: string | null };
}

export class RunResultItemDto {
  @ApiProperty({ example: 'google-places' })
  providerId!: string;

  @ApiProperty({ example: 'ChIJtSa8ulg9WBQR8kGjA-Vw1ig' })
  providerRecordId!: string;

  @ApiProperty({ example: 'عيادة مونسترز لأسنان الأطفال' })
  companyName!: string;

  @ApiProperty({ nullable: true, example: 'dental-clinic' })
  category!: string | null;

  @ApiProperty({ nullable: true, example: 'التجمع الخامس، شارع التسعين' })
  address!: string | null;

  @ApiProperty({ nullable: true, example: '+201201211000' })
  phone!: string | null;

  @ApiProperty({ nullable: true, example: 'https://www.example.com' })
  website!: string | null;

  @ApiProperty({ nullable: true, example: 4.8 })
  rating!: number | null;

  @ApiProperty({ nullable: true, example: 108 })
  ratingCount!: number | null;

  @ApiProperty({ nullable: true, example: 'https://maps.google.com/?cid=...' })
  sourceUrl!: string | null;

  @ApiProperty({ type: ResultQualificationDto })
  qualification!: ResultQualificationDto;

  static from(result: QualifiedResult): RunResultItemDto {
    const dto = new RunResultItemDto();
    dto.providerId = result.providerId;
    dto.providerRecordId = result.providerRecordId;
    dto.companyName = result.companyName;
    dto.category = result.category;
    dto.address = result.address;
    dto.phone = result.phone;
    dto.website = result.website;
    dto.rating = result.rating;
    dto.ratingCount = result.ratingCount;
    dto.sourceUrl = result.sourceUrl;
    dto.qualification = {
      status: result.qualification.status,
      reason: result.qualification.reason,
      website: result.qualification.website,
      social: result.qualification.social,
    };
    return dto;
  }
}

export class RunSummaryDto {
  @ApiProperty({ example: 14 })
  discovered!: number;

  @ApiProperty({ example: 8 })
  qualified!: number;

  @ApiProperty({ example: 3 })
  rejected!: number;

  @ApiProperty({ example: 3 })
  unverifiedSocial!: number;

  @ApiProperty({ example: 1 })
  pagesRequested!: number;

  @ApiProperty({ example: 14 })
  uniqueResults!: number;

  @ApiProperty({ example: 0 })
  duplicateResults!: number;

  @ApiProperty({ example: 1234 })
  durationMs!: number;
}

export class RunResponseDto {
  @ApiProperty({ example: 'job-uuid' })
  runId!: string;

  @ApiProperty({ example: 'job-uuid' })
  jobId!: string;

  @ApiProperty({ example: 'execution-uuid' })
  executionId!: string;

  @ApiProperty({ example: 'COMPLETED', enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] })
  status!: string;

  @ApiProperty({ example: 'هاتلي 100 عيادة أسنان في التجمع' })
  query!: string;

  @ApiProperty({ type: Object })
  intent!: SearchIntent;

  @ApiProperty({ type: RunSummaryDto })
  summary!: RunSummaryDto;

  @ApiProperty({ type: [RunResultItemDto] })
  results!: RunResultItemDto[];

  static from(result: DiscoveryRunResult): RunResponseDto {
    const dto = new RunResponseDto();
    dto.runId = result.runId;
    dto.jobId = result.jobId;
    dto.executionId = result.executionId;
    dto.status = result.status;
    dto.query = result.query;
    dto.intent = result.intent;
    dto.summary = result.summary;
    dto.results = result.results.map(RunResultItemDto.from);
    return dto;
  }
}
