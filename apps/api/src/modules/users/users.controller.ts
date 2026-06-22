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
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles(Role.ADMIN) // user management is admin-only
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    const user = await this.users.create(dto);
    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role },
    });
    return user;
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const user = await this.users.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      after: { role: user.role, active: user.active },
    });
    return user;
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@Param('id') id: string) {
    return this.users.setActive(id, false);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reactivate a user' })
  activate(@Param('id') id: string) {
    return this.users.setActive(id, true);
  }
}
