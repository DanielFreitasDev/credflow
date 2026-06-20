import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpdateScoreDto,
  UpdateStatusDto,
} from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @Roles(Role.OPERATOR, Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Create a customer (PF or PJ)' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser('id') actorId: string) {
    return this.customers.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List customers (filter + paginate)' })
  findAll(@Query() query: CustomerQueryDto) {
    return this.customers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Get(':id/financial-history')
  @ApiOperation({ summary: 'Aggregated financial history' })
  financialHistory(@Param('id') id: string) {
    return this.customers.getFinancialHistory(id);
  }

  @Patch(':id')
  @Roles(Role.OPERATOR, Role.ANALYST, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser('id') actorId: string) {
    return this.customers.update(id, dto, actorId);
  }

  @Patch(':id/status')
  @Roles(Role.ANALYST, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser('id') actorId: string) {
    return this.customers.updateStatus(id, dto.status, dto.reason, actorId);
  }

  @Patch(':id/score')
  @Roles(Role.ANALYST, Role.MANAGER)
  @ApiOperation({ summary: 'Manually adjust the internal score' })
  updateScore(@Param('id') id: string, @Body() dto: UpdateScoreDto, @CurrentUser('id') actorId: string) {
    return this.customers.updateScore(id, dto.score, dto.reason, actorId);
  }
}
