import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class EnrichLeadDto {
  @ApiPropertyOptional({ description: 'Skip website metadata enrichment' })
  @IsOptional()
  @IsBoolean()
  skipWebsite?: boolean;

  @ApiPropertyOptional({ description: 'Skip social profile discovery and verification' })
  @IsOptional()
  @IsBoolean()
  skipSocial?: boolean;
}

export class LeadEnrichmentResultDto {
  @ApiProperty({ example: '2f1d4b3a-...' })
  leadId!: string;

  @ApiPropertyOptional({ nullable: true })
  enrichment!: {
    status: string;
    enrichedAt: string | null;
    website: {
      title: string | null;
      description: string | null;
      techHints: string[];
      socialLinks: string[];
    } | null;
    social: {
      profiles: Array<{
        platform: string;
        handle: string;
        profileUrl: string | null;
        confidence: number;
        verified: boolean;
      }>;
    } | null;
  } | null;

  @ApiProperty({ example: 1234 })
  durationMs!: number;

  static from(
    leadId: string,
    enrichment: LeadEnrichmentResultDto['enrichment'],
    durationMs: number,
  ): LeadEnrichmentResultDto {
    const dto = new LeadEnrichmentResultDto();
    dto.leadId = leadId;
    dto.enrichment = enrichment;
    dto.durationMs = durationMs;
    return dto;
  }
}
