import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProposalsService } from './proposals.service';
import {
  CancelProposalDto,
  CreateProposalDto,
  ProposalQueryDto,
  SimulateProposalDto,
} from './dto/proposal.dto';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('simulate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulate a loan (installments, totals, CET) without saving' })
  simulate(@Body() dto: SimulateProposalDto) {
    return this.proposals.simulate(dto);
  }

  @Post()
  @Roles(Role.OPERATOR, Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Create a credit proposal (DRAFT)' })
  create(@Body() dto: CreateProposalDto, @CurrentUser('id') actorId: string) {
    return this.proposals.create(dto, actorId);
  }

  @Get()
  findAll(@Query() query: ProposalQueryDto, @CurrentUser('role') role: string) {
    return this.proposals.findAll(query, role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('role') role: string) {
    return this.proposals.findOne(id, role);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(Role.OPERATOR, Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Submit a DRAFT proposal for analysis' })
  submit(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.proposals.submit(id, actorId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(Role.ANALYST, Role.MANAGER)
  cancel(@Param('id') id: string, @Body() dto: CancelProposalDto, @CurrentUser('id') actorId: string) {
    return this.proposals.cancel(id, dto.reason, actorId);
  }
}
