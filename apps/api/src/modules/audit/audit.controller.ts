import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditQueryService } from './audit.query.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@Roles(Role.AUDITOR, Role.MANAGER)
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Query the audit trail' })
  findAll(@Query() query: AuditQueryDto) {
    return this.audit.findAll(query);
  }
}
