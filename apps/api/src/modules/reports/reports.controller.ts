import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('customers.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  @ApiOperation({ summary: 'Export the customer portfolio as CSV' })
  customers(@CurrentUser('id') actorId: string) {
    return this.reports.customers(actorId);
  }

  @Get('proposals.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="proposals.csv"')
  @ApiOperation({ summary: 'Export proposals as CSV' })
  proposals(@CurrentUser('id') actorId: string) {
    return this.reports.proposals(actorId);
  }

  @Get('contracts.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contracts.csv"')
  @ApiOperation({ summary: 'Export contracts as CSV' })
  contracts(@CurrentUser('id') actorId: string) {
    return this.reports.contracts(actorId);
  }

  @Get('payments.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payments.csv"')
  @ApiOperation({ summary: 'Export payments as CSV' })
  payments(@CurrentUser('id') actorId: string) {
    return this.reports.payments(actorId);
  }

  @Get('collections.csv')
  @Roles(Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="collections.csv"')
  @ApiOperation({ summary: 'Export collection cases as CSV' })
  collections(@CurrentUser('id') actorId: string) {
    return this.reports.collections(actorId);
  }

  @Get('audit.csv')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit.csv"')
  @ApiOperation({ summary: 'Export the audit trail as CSV (most recent first)' })
  audit(@CurrentUser('id') actorId: string) {
    return this.reports.auditLogs(actorId);
  }
}
