import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnalysisService } from './analysis.service';
import { DecideDto } from './dto/analysis.dto';

@ApiTags('analysis')
@ApiBearerAuth()
@Controller('proposals/:id')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('analyze')
  @HttpCode(200)
  @Roles(Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Run the automatic credit rule engine' })
  analyze(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.analysis.analyze(id, actorId);
  }

  @Post('decision')
  @HttpCode(200)
  @Roles(Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Record a manual approval/rejection' })
  decide(@Param('id') id: string, @Body() dto: DecideDto, @CurrentUser('id') actorId: string) {
    return this.analysis.decide(id, dto, actorId);
  }

  @Get('analysis')
  @ApiOperation({ summary: 'Get the analysis of a proposal' })
  get(@Param('id') id: string) {
    return this.analysis.getByProposal(id);
  }
}
