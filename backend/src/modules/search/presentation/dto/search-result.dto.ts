import { ApiProperty } from '@nestjs/swagger';
import type { NormalizedSearchResult } from '../../domain/entities/normalized-search-result.js';

export class SearchResultDto {
  @ApiProperty({ example: 'mock' })
  providerId!: string;

  @ApiProperty({ example: 'mock-clinic-001' })
  providerRecordId!: string;

  @ApiProperty({ example: 'عيادة د. أحمد عبد الله لطب الأسنان' })
  companyName!: string;

  @ApiProperty({ nullable: true, example: 'dental-clinic' })
  category!: string | null;

  @ApiProperty({ nullable: true, example: 'التجمع الخامس، شارع التسعين، القاهرة الجديدة' })
  address!: string | null;

  @ApiProperty({ nullable: true, example: 'التجمع الخامس' })
  area!: string | null;

  @ApiProperty({ nullable: true, example: '+201001234567' })
  phone!: string | null;

  @ApiProperty({ nullable: true, example: 'https://www.example.com' })
  website!: string | null;

  @ApiProperty({ nullable: true, example: 4.6 })
  rating!: number | null;

  @ApiProperty({ nullable: true, example: 128 })
  ratingCount!: number | null;

  @ApiProperty({ example: 'UNKNOWN', enum: ['VERIFIED', 'UNVERIFIED', 'UNKNOWN'] })
  verificationStatus!: string;

  @ApiProperty({ nullable: true, example: 'https://maps.example.com/place/mock-clinic-001' })
  sourceUrl!: string | null;

  @ApiProperty({ example: '2026-08-10T10:00:00.000Z' })
  retrievedAt!: string;

  static from(result: NormalizedSearchResult): SearchResultDto {
    const dto = new SearchResultDto();
    dto.providerId = result.providerId;
    dto.providerRecordId = result.providerRecordId;
    dto.companyName = result.companyName;
    dto.category = result.category;
    dto.address = result.address;
    dto.area = result.area;
    dto.phone = result.phone;
    dto.website = result.website;
    dto.rating = result.rating;
    dto.ratingCount = result.ratingCount;
    dto.verificationStatus = result.verificationStatus;
    dto.sourceUrl = result.sourceUrl;
    dto.retrievedAt = result.retrievedAt.toISOString();
    return dto;
  }
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  data!: SearchResultDto[];

  @ApiProperty({ example: { count: 3 } })
  meta!: { count: number };
}
