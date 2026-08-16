import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { GetSearchHistoryUseCase } from '../../application/use-cases/get-search-history.usecase.js';
import { SearchCompaniesUseCase } from '../../application/use-cases/search-companies.usecase.js';
import { translateArabicIntent } from '../../application/services/arabic-intent-translator.js';
import { SearchQuery } from '../../domain/entities/search-query.js';
import { SearchHistoryItemDto, SearchHistoryResponseDto } from '../dto/search-history.dto.js';
import { SearchRequestDto } from '../dto/search-request.dto.js';
import { SearchResponseDto, SearchResultDto } from '../dto/search-result.dto.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchCompaniesUseCase: SearchCompaniesUseCase,
    private readonly getSearchHistoryUseCase: GetSearchHistoryUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search businesses through the active provider and return normalized results' })
  @ApiOkResponse({ type: SearchResponseDto })
  async search(@CurrentUser() user: AuthPrincipal, @Body() dto: SearchRequestDto): Promise<SearchResponseDto> {
    const results = await this.searchCompaniesUseCase.search(toSearchQuery(dto), user);
    return { data: results.map(SearchResultDto.from), meta: { count: results.length } };
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's recent search jobs with their result counts" })
  @ApiOkResponse({ type: SearchHistoryResponseDto })
  async history(@CurrentUser() user: AuthPrincipal): Promise<SearchHistoryResponseDto> {
    const items = await this.getSearchHistoryUseCase.getHistory(user.userId);
    return { data: items.map(SearchHistoryItemDto.from), meta: { count: items.length } };
  }
}

function toSearchQuery(dto: SearchRequestDto): SearchQuery {
  const intent = translateArabicIntent(dto.query);

  const filters = {
    category: dto.category ?? intent.discovery.category,
    governorate: dto.governorate ?? intent.discovery.location.governorate,
    minRating: dto.minRating ?? intent.discovery.minRating,
    verifiedOnly: dto.verifiedOnly,
    intent,
  };

  return new SearchQuery(dto.query, filters, undefined, intent.opportunity.maxQuantity);
}
