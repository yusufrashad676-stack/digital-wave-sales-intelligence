import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthPrincipal } from '../../../../common/interfaces/auth-principal.interface.js';
import { RunDiscoveryUseCase } from '../../application/use-cases/run-discovery.usecase.js';
import { RunRequestDto } from '../dto/run-request.dto.js';
import { RunResponseDto } from '../dto/run-result.dto.js';

@ApiTags('runs')
@Controller('runs')
export class RunController {
  constructor(private readonly runDiscoveryUseCase: RunDiscoveryUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Execute a one-click lead discovery run from a natural-language query' })
  @ApiOkResponse({ type: RunResponseDto })
  async run(@CurrentUser() user: AuthPrincipal, @Body() dto: RunRequestDto): Promise<RunResponseDto> {
    const result = await this.runDiscoveryUseCase.run(dto.query, user);
    return RunResponseDto.from(result);
  }
}
