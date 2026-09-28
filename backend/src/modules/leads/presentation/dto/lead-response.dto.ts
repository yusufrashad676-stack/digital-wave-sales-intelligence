import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { projectEnrichment } from '../../../../common/utils/enrichment-projection.util.js';
import type { LeadSnapshot } from '../../domain/entities/lead.entity.js';

export class LeadWebsiteEnrichmentDto {
  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ type: [String] })
  techHints!: string[];

  @ApiProperty({ type: [String] })
  socialLinks!: string[];
}

export class LeadSocialProfileDto {
  @ApiProperty()
  platform!: string;

  @ApiProperty()
  handle!: string;

  @ApiPropertyOptional({ nullable: true })
  profileUrl!: string | null;

  @ApiProperty()
  confidence!: number;

  @ApiProperty()
  verified!: boolean;
}

export class LeadSocialEnrichmentDto {
  @ApiProperty({ type: [LeadSocialProfileDto] })
  profiles!: LeadSocialProfileDto[];
}

export class LeadEnrichmentDto {
  @ApiProperty({
    example: 'ENRICHED',
    enum: ['PENDING', 'IN_PROGRESS', 'ENRICHED', 'PARTIALLY_ENRICHED', 'ENRICHMENT_FAILED', 'SKIPPED'],
  })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  enrichedAt!: string | null;

  @ApiPropertyOptional({ type: LeadWebsiteEnrichmentDto, nullable: true })
  website!: LeadWebsiteEnrichmentDto | null;

  @ApiPropertyOptional({ type: LeadSocialEnrichmentDto, nullable: true })
  social!: LeadSocialEnrichmentDto | null;
}

export class LeadResponseDto {
  @ApiProperty({ example: '2f1d4b3a-...' })
  id!: string;

  @ApiProperty({ example: 'NEW', enum: ['NEW', 'REVIEWED', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED'] })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ example: 'mock' })
  providerId!: string;

  @ApiProperty({ example: 'mock-restaurant-003' })
  providerRecordId!: string;

  @ApiProperty({ example: 'مطعم أبو قير للمأكولات البحرية' })
  companyName!: string;

  @ApiPropertyOptional({ nullable: true })
  category!: string | null;

  @ApiPropertyOptional({ nullable: true })
  area!: string | null;

  @ApiPropertyOptional({ nullable: true })
  address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true })
  website!: string | null;

  @ApiPropertyOptional({ nullable: true })
  rating!: number | null;

  @ApiPropertyOptional({ nullable: true })
  ratingCount!: number | null;

  @ApiProperty({ example: 'UNKNOWN', enum: ['VERIFIED', 'UNVERIFIED', 'UNKNOWN'] })
  verificationStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceUrl!: string | null;

  @ApiPropertyOptional({ type: LeadEnrichmentDto, nullable: true })
  enrichment!: LeadEnrichmentDto | null;

  @ApiProperty({ example: '2026-08-15T10:00:00.000Z' })
  retrievedAt!: string;

  @ApiProperty({ example: '2026-08-15T10:05:00.000Z' })
  savedAt!: string;

  @ApiProperty({ example: '2026-08-15T10:05:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-15T10:05:00.000Z' })
  updatedAt!: string;

  static from(lead: LeadSnapshot): LeadResponseDto {
    const dto = new LeadResponseDto();
    dto.id = lead.id;
    dto.status = lead.status;
    dto.notes = lead.notes;
    dto.providerId = lead.providerId;
    dto.providerRecordId = lead.providerRecordId;
    dto.companyName = lead.companyName;
    dto.category = lead.category;
    dto.area = lead.area;
    dto.address = lead.address;
    dto.phone = lead.phone;
    dto.email = lead.email;
    dto.website = lead.website;
    dto.rating = lead.rating;
    dto.ratingCount = lead.ratingCount;
    dto.verificationStatus = lead.verificationStatus;
    dto.sourceUrl = lead.sourceUrl;
    dto.enrichment = projectEnrichment(
      lead.enrichmentStatus,
      lead.enrichmentSnapshot,
      lead.enrichedAt === null ? null : new Date(lead.enrichedAt),
    );
    dto.retrievedAt = lead.retrievedAt;
    dto.savedAt = lead.savedAt;
    dto.createdAt = lead.createdAt;
    dto.updatedAt = lead.updatedAt;
    return dto;
  }
}

export class LeadsResponseDto {
  @ApiProperty({ type: [LeadResponseDto] })
  data!: LeadResponseDto[];

  @ApiProperty({ example: { count: 2 } })
  meta!: { count: number };
}

export class LeadDeletedResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
