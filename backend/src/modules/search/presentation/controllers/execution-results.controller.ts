import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { GetExecutionUseCase } from '../../application/use-cases/get-execution.usecase.js';
import { GetExecutionResultsUseCase } from '../../application/use-cases/get-execution-results.usecase.js';
import {
  ExecutionDetailDto,
  ExecutionResultsResponseDto,
  toExecutionResultsResponse,
} from '../dto/execution-result.dto.js';

@ApiTags('executions')
@Controller('search/executions')
export class ExecutionResultsController {
  constructor(
    private readonly getExecutionUseCase: GetExecutionUseCase,
    private readonly getExecutionResultsUseCase: GetExecutionResultsUseCase,
  ) {}

  @Get(':executionId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a search execution with recomputed qualification and enrichment summary' })
  @ApiOkResponse({ type: ExecutionDetailDto })
  async getExecution(
    @CurrentUser() principal: AuthPrincipal,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ): Promise<ExecutionDetailDto> {
    return ExecutionDetailDto.from(await this.getExecutionUseCase.execute(executionId, principal));
  }

  @Get(':executionId/results')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get execution results with read-time qualification and curated enrichment' })
  @ApiOkResponse({ type: ExecutionResultsResponseDto })
  async getResults(
    @CurrentUser() principal: AuthPrincipal,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ): Promise<ExecutionResultsResponseDto> {
    const { results, count } = await this.getExecutionResultsUseCase.execute(executionId, principal);
    return toExecutionResultsResponse(results, count);
  }
}
