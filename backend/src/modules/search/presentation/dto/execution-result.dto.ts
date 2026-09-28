import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ExecutionDetail } from '../../application/use-cases/get-execution.usecase.js';
import type { ExecutionResultItem } from '../../application/use-cases/get-execution-results.usecase.js';
import type { ResultQualification } from '../../domain/entities/discovery-run.js';
import type { EnrichmentView } from '../../../../common/utils/enrichment-projection.util.js';

export class EnrichmentCountsDto {
  @ApiProperty({ example: 1 })
  pending!: number;

  @ApiProperty({ example: 0 })
  inProgress!: number;

  @ApiProperty({ example: 15 })
  enriched!: number;

  @ApiProperty({ example: 3 })
  partiallyEnriched!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 0 })
  skipped!: number;

  @ApiProperty({ example: 17 })
  websiteFound!: number;

  @ApiProperty({ example: 40 })
  socialProfilesFound!: number;

  @ApiProperty({ example: 6 })
  socialProfilesVerified!: number;
}

export class ExecutionSummaryDto {
  @ApiProperty({ example: 20 })
  total!: number;

  @ApiProperty({ example: 16 })
  qualified!: number;

  @ApiProperty({ example: 2 })
  rejected!: number;

  @ApiProperty({ example: 2 })
  unverifiedSocial!: number;

  @ApiPropertyOptional({ nullable: true, example: 897 })
  durationMs!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 30135 })
  enrichmentDurationMs!: number | null;

  @ApiProperty({ type: EnrichmentCountsDto })
  enrichment!: EnrichmentCountsDto;
}

export class ExecutionDetailDto {
  @ApiProperty({ example: '22d83e8c-0b2d-41bc-a949-8c05dc94fa53' })
  executionId!: string;

  @ApiProperty({ example: '63ea68ac-2ead-4bbb-86c8-92e814cc6abc' })
  jobId!: string;

  @ApiProperty({ example: 'COMPLETED' })
  status!: string;

  @ApiProperty({ example: '5 restaurants in Dublin Ireland' })
  query!: string;

  @ApiProperty({ example: '2026-08-17T16:49:07.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-08-17T16:49:08.500Z' })
  finishedAt!: string | null;

  @ApiProperty({ type: ExecutionSummaryDto })
  summary!: ExecutionSummaryDto;

  static from(detail: ExecutionDetail): ExecutionDetailDto {
    const dto = new ExecutionDetailDto();
    dto.executionId = detail.executionId;
    dto.jobId = detail.jobId;
    dto.status = detail.status;
    dto.query = detail.query;
    dto.createdAt = detail.createdAt;
    dto.finishedAt = detail.finishedAt;
    dto.summary = detail.summary as ExecutionSummaryDto;
    return dto;
  }
}

export class ResultQualificationDto {
  @ApiProperty({ example: 'QUALIFIED', enum: ['QUALIFIED', 'UNVERIFIED_SOCIAL', 'REJECTED'] })
  status!: string;

  @ApiProperty({ example: 'All discovery-level criteria satisfied' })
  reason!: string;

  @ApiProperty({ example: { requested: 'ANY', observed: 'PRESENT', source: 'google-places' } })
  website!: { requested: string; observed: string; source: string | null };

  @ApiProperty({ example: { requested: 'ANY', observed: 'UNKNOWN', source: null } })
  social!: { requested: string; observed: string; source: string | null };
}

export class WebsiteEnrichmentDto {
  @ApiPropertyOptional({ nullable: true, example: 'The Old Mill Restaurant' })
  title!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Traditional Irish restaurant in Temple Bar' })
  description!: string | null;

  @ApiProperty({ type: [String], example: ['wordpress'] })
  techHints!: string[];

  @ApiProperty({ type: [String], example: ['https://facebook.com/oldmillrestaurant'] })
  socialLinks!: string[];
}

export class SocialProfileDto {
  @ApiProperty({ example: 'facebook' })
  platform!: string;

  @ApiProperty({ example: 'oldmillrestaurant' })
  handle!: string;

  @ApiPropertyOptional({ nullable: true, example: 'https://facebook.com/oldmillrestaurant' })
  profileUrl!: string | null;

  @ApiProperty({ example: 0.9 })
  confidence!: number;

  @ApiProperty({ example: false })
  verified!: boolean;
}

export class SocialEnrichmentDto {
  @ApiProperty({ type: [SocialProfileDto] })
  profiles!: SocialProfileDto[];
}

export class EnrichmentViewDto {
  @ApiProperty({
    example: 'ENRICHED',
    enum: ['PENDING', 'IN_PROGRESS', 'ENRICHED', 'PARTIALLY_ENRICHED', 'ENRICHMENT_FAILED', 'SKIPPED'],
  })
  status!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-08-17T16:50:38.000Z' })
  enrichedAt!: string | null;

  @ApiPropertyOptional({ type: WebsiteEnrichmentDto, nullable: true })
  website!: WebsiteEnrichmentDto | null;

  @ApiPropertyOptional({ type: SocialEnrichmentDto, nullable: true })
  social!: SocialEnrichmentDto | null;
}

export class ExecutionResultItemDto {
  @ApiProperty({ example: '9c1a2e34-...' })
  resultId!: string;

  @ApiProperty({ example: 'google-places' })
  providerId!: string;

  @ApiProperty({ example: 'ChIJO0IAQ4UOZ0gRf4GJOMtiPUY' })
  providerRecordId!: string;

  @ApiProperty({ example: 'The Vintage Kitchen' })
  companyName!: string;

  @ApiPropertyOptional({ nullable: true, example: 'restaurant' })
  category!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '7 Poolbeg St, Dublin 2, Ireland' })
  address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  area!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '016798705' })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'https://www.thevintagekitchen.ie' })
  website!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 4.7 })
  rating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1659 })
  ratingCount!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'https://maps.google.com/?cid=...' })
  sourceUrl!: string | null;

  @ApiProperty({ example: 'UNKNOWN', enum: ['VERIFIED', 'UNVERIFIED', 'UNKNOWN'] })
  verificationStatus!: string;

  @ApiProperty({ example: '2026-08-17T16:49:08.009Z' })
  retrievedAt!: string;

  @ApiProperty({ type: ResultQualificationDto })
  qualification!: ResultQualificationDto;

  @ApiPropertyOptional({ type: EnrichmentViewDto, nullable: true })
  enrichment!: EnrichmentViewDto | null;
}

export class ExecutionResultsResponseDto {
  @ApiProperty({ type: [ExecutionResultItemDto] })
  data!: ExecutionResultItemDto[];

  @ApiProperty({ example: { count: 20 } })
  meta!: { count: number };
}

export function toResultItemDto(item: ExecutionResultItem): ExecutionResultItemDto {
  const dto = new ExecutionResultItemDto();
  dto.resultId = item.resultId;
  dto.providerId = item.providerId;
  dto.providerRecordId = item.providerRecordId;
  dto.companyName = item.companyName;
  dto.category = item.category;
  dto.address = item.address;
  dto.area = item.area;
  dto.phone = item.phone;
  dto.email = item.email;
  dto.website = item.website;
  dto.rating = item.rating;
  dto.ratingCount = item.ratingCount;
  dto.sourceUrl = item.sourceUrl;
  dto.verificationStatus = item.verificationStatus;
  dto.retrievedAt = item.retrievedAt;
  dto.qualification = item.qualification as unknown as ResultQualificationDto;
  dto.enrichment = item.enrichment as unknown as EnrichmentViewDto;
  return dto;
}

export function toExecutionResultsResponse(items: ExecutionResultItem[], count: number): ExecutionResultsResponseDto {
  const response = new ExecutionResultsResponseDto();
  response.data = items.map(toResultItemDto);
  response.meta = { count };
  return response;
}

export type { ResultQualification, EnrichmentView };
