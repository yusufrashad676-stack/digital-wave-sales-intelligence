import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SearchJobHistoryItem } from '../../domain/ports/search-job.repository.js';

export class SearchHistoryItemDto {
  @ApiProperty({ example: '24f1c4a2-...' })
  id!: string;

  @ApiProperty({ example: 'عيادات في التجمع' })
  query!: string;

  @ApiPropertyOptional({ example: { category: 'clinic', minRating: 4 } })
  filters!: Record<string, unknown>;

  @ApiProperty({ example: 'COMPLETED' })
  status!: string;

  @ApiProperty({ example: 3 })
  resultCount!: number;

  @ApiProperty({ nullable: true, example: '2026-08-10T10:00:00.000Z' })
  executedAt!: string | null;

  @ApiProperty({ example: '2026-08-10T10:00:00.000Z' })
  createdAt!: string;

  static from(item: SearchJobHistoryItem): SearchHistoryItemDto {
    const dto = new SearchHistoryItemDto();
    dto.id = item.id;
    dto.query = item.query;
    dto.filters = item.filters as unknown as Record<string, unknown>;
    dto.status = item.status;
    dto.resultCount = item.resultCount;
    dto.executedAt = item.executedAt;
    dto.createdAt = item.createdAt;
    return dto;
  }
}

export class SearchHistoryResponseDto {
  @ApiProperty({ type: [SearchHistoryItemDto] })
  data!: SearchHistoryItemDto[];

  @ApiProperty({ example: { count: 3 } })
  meta!: { count: number };
}
