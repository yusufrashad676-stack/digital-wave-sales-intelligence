import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import type { LeadStatus } from '../../domain/entities/lead.entity.js';
import { GetSavedLeadUseCase } from '../../application/use-cases/get-saved-lead.usecase.js';
import { ListSavedLeadsUseCase } from '../../application/use-cases/list-saved-leads.usecase.js';
import { RemoveSavedLeadUseCase } from '../../application/use-cases/remove-saved-lead.usecase.js';
import { SaveLeadUseCase } from '../../application/use-cases/save-lead.usecase.js';
import { UpdateSavedLeadUseCase } from '../../application/use-cases/update-saved-lead.usecase.js';
import { LeadDeletedResponseDto, LeadResponseDto, LeadsResponseDto } from '../dto/lead-response.dto.js';
import { SaveLeadDto } from '../dto/save-lead.dto.js';
import { UpdateLeadDto } from '../dto/update-lead.dto.js';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly saveLeadUseCase: SaveLeadUseCase,
    private readonly listSavedLeadsUseCase: ListSavedLeadsUseCase,
    private readonly getSavedLeadUseCase: GetSavedLeadUseCase,
    private readonly updateSavedLeadUseCase: UpdateSavedLeadUseCase,
    private readonly removeSavedLeadUseCase: RemoveSavedLeadUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a discovered business as a lead (idempotent per user + provider record)' })
  @ApiCreatedResponse({ type: LeadResponseDto })
  async save(@CurrentUser() principal: AuthPrincipal, @Body() dto: SaveLeadDto): Promise<LeadResponseDto> {
    const lead = await this.saveLeadUseCase.save(principal.userId, toSaveLeadInput(dto));
    return LeadResponseDto.from(lead);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's saved leads" })
  @ApiOkResponse({ type: LeadsResponseDto })
  async list(@CurrentUser() principal: AuthPrincipal): Promise<LeadsResponseDto> {
    const leads = await this.listSavedLeadsUseCase.list(principal.userId);
    return { data: leads.map(LeadResponseDto.from), meta: { count: leads.length } };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single saved lead owned by the authenticated user' })
  @ApiOkResponse({ type: LeadResponseDto })
  async get(@CurrentUser() principal: AuthPrincipal, @Param('id') id: string): Promise<LeadResponseDto> {
    const lead = await this.getSavedLeadUseCase.get(principal.userId, id);
    return LeadResponseDto.from(lead);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a saved lead status and/or notes' })
  @ApiOkResponse({ type: LeadResponseDto })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<LeadResponseDto> {
    const lead = await this.updateSavedLeadUseCase.update(principal.userId, id, {
      ...(dto.status !== undefined ? { status: dto.status as LeadStatus } : {}),
      ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
    });
    return LeadResponseDto.from(lead);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a saved lead (soft delete)' })
  @ApiOkResponse({ type: LeadDeletedResponseDto })
  async remove(@CurrentUser() principal: AuthPrincipal, @Param('id') id: string): Promise<LeadDeletedResponseDto> {
    await this.removeSavedLeadUseCase.remove(principal.userId, id);
    return { success: true };
  }
}

function toSaveLeadInput(dto: SaveLeadDto) {
  return {
    providerId: dto.providerId,
    providerRecordId: dto.providerRecordId,
    companyName: dto.companyName,
    category: dto.category ?? null,
    address: dto.address ?? null,
    area: dto.area ?? null,
    phone: dto.phone ?? null,
    email: dto.email ?? null,
    website: dto.website ?? null,
    rating: dto.rating ?? null,
    ratingCount: dto.ratingCount ?? null,
    verificationStatus: dto.verificationStatus as 'UNKNOWN',
    sourceUrl: dto.sourceUrl ?? null,
    retrievedAt: dto.retrievedAt,
  };
}
