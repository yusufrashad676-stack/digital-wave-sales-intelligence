import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { EnrichSearchResultsUseCase } from '../../application/use-cases/enrich-search-results.usecase.js';
import { EnrichRequestDto } from '../dto/enrich-request.dto.js';
import { EnrichResponseDto } from '../dto/enrich-result.dto.js';

@ApiTags('enrichment')
@Controller('search/executions')
export class EnrichController {
  constructor(private readonly enrichUseCase: EnrichSearchResultsUseCase) {}

  @Post(':executionId/enrich')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enrich search results with website and social data' })
  @ApiOkResponse({ type: EnrichResponseDto })
  async enrich(
    @CurrentUser() user: AuthPrincipal,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() dto: EnrichRequestDto,
  ): Promise<EnrichResponseDto> {
    const result = await this.enrichUseCase.execute({
      executionId,
      principal: user,
      options: dto,
    });
    return EnrichResponseDto.from(result);
  }
}
