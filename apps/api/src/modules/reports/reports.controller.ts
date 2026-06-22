import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@ApiQuery({ name: 'from', required: false, description: 'ISO date — inclusive lower bound' })
@ApiQuery({ name: 'to', required: false, description: 'ISO date — inclusive upper bound' })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('customers.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  @ApiOperation({ summary: 'Export the customer portfolio as CSV' })
  customers(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.customers(actorId, query);
  }

  @Get('proposals.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="proposals.csv"')
  @ApiOperation({ summary: 'Export proposals as CSV' })
  proposals(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.proposals(actorId, query);
  }

  @Get('contracts.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contracts.csv"')
  @ApiOperation({ summary: 'Export contracts as CSV' })
  contracts(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.contracts(actorId, query);
  }

  @Get('payments.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payments.csv"')
  @ApiOperation({ summary: 'Export payments as CSV' })
  payments(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.payments(actorId, query);
  }

  @Get('collections.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="collections.csv"')
  @ApiOperation({ summary: 'Export collection cases as CSV' })
  collections(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.collections(actorId, query);
  }

  @Get('audit.csv')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit.csv"')
  @ApiOperation({ summary: 'Export the audit trail as CSV (most recent first)' })
  audit(@CurrentUser('id') actorId: string, @Query() query: ReportQueryDto) {
    return this.reports.auditLogs(actorId, query);
  }
}
