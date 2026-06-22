import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContractsService } from './contracts.service';
import { ContractQueryDto, CreateContractDto } from './dto/contract.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post('from-proposal/:proposalId')
  @Roles(Role.MANAGER, Role.ANALYST)
  @ApiOperation({ summary: 'Generate a contract from an approved proposal' })
  create(
    @Param('proposalId') proposalId: string,
    @Body() dto: CreateContractDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.contracts.createFromProposal(proposalId, dto, actorId);
  }

  @Get()
  findAll(@Query() query: ContractQueryDto, @CurrentUser('role') role: string) {
    return this.contracts.findAll(query, role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('role') role: string) {
    return this.contracts.findOne(id, role);
  }

  @Get(':id/installments')
  installments(@Param('id') id: string) {
    return this.contracts.getInstallments(id);
  }

  @Get('installments/:installmentId/charges')
  @ApiOperation({ summary: 'Preview current late charges for an installment' })
  charges(@Param('installmentId') installmentId: string, @Query('date') date?: string) {
    return this.contracts.previewCharges(installmentId, date);
  }

  @Post(':id/cancel')
  @Roles(Role.MANAGER)
  cancel(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.contracts.cancel(id, actorId);
  }
}
