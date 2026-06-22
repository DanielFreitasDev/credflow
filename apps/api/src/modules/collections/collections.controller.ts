import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CollectionsService } from './collections.service';
import {
  CollectionQueryDto,
  CreateInteractionDto,
  CreatePromiseDto,
  RenegotiateDto,
  UpdateCaseStatusDto,
  UpdatePromiseDto,
} from './dto/collection.dto';

@ApiTags('collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Post('run')
  @HttpCode(200)
  @Roles(Role.MANAGER, Role.OPERATOR)
  @ApiOperation({
    summary: 'Run the full collections cycle (arrears, dunning ladder, promise reconciliation)',
  })
  run() {
    return this.collections.runDailyCollections();
  }

  @Get()
  @ApiOperation({ summary: 'List collection cases' })
  list(@Query() query: CollectionQueryDto, @CurrentUser('role') role: string) {
    return this.collections.list(query, role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('role') role: string) {
    return this.collections.findOne(id, role);
  }

  @Post(':id/interactions')
  @Roles(Role.OPERATOR, Role.MANAGER)
  addInteraction(@Param('id') id: string, @Body() dto: CreateInteractionDto, @CurrentUser('id') actorId: string) {
    return this.collections.addInteraction(id, dto, actorId);
  }

  @Post(':id/promises')
  @Roles(Role.OPERATOR, Role.MANAGER)
  addPromise(@Param('id') id: string, @Body() dto: CreatePromiseDto, @CurrentUser('id') actorId: string) {
    return this.collections.addPromise(id, dto, actorId);
  }

  @Patch('promises/:promiseId')
  @Roles(Role.OPERATOR, Role.MANAGER)
  updatePromise(@Param('promiseId') promiseId: string, @Body() dto: UpdatePromiseDto, @CurrentUser('id') actorId: string) {
    return this.collections.updatePromise(promiseId, dto.status, actorId);
  }

  @Patch(':id/status')
  @Roles(Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCaseStatusDto, @CurrentUser('id') actorId: string) {
    return this.collections.updateCaseStatus(id, dto.status, actorId);
  }

  @Post('contracts/:contractId/renegotiate')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Renegotiate a contract debt into a new contract' })
  renegotiate(@Param('contractId') contractId: string, @Body() dto: RenegotiateDto, @CurrentUser('id') actorId: string) {
    return this.collections.renegotiate(contractId, dto, actorId);
  }
}
