import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const LEAD_STATUSES = ['NEW', 'REVIEWED', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED'] as const;

export class UpdateLeadDto {
  @ApiPropertyOptional({ example: 'CONTACTED', enum: LEAD_STATUSES, description: 'New lead status' })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: 'تمت المكالمة الأولى، طلب عرض سعر.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
