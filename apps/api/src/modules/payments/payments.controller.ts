import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, PaymentQueryDto, SettleInstallmentDto } from './dto/payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Roles(Role.OPERATOR, Role.MANAGER)
  @ApiOperation({ summary: 'Register a payment (supports partial and late)' })
  register(@Body() dto: CreatePaymentDto, @CurrentUser('id') actorId: string) {
    return this.payments.register(dto, actorId);
  }

  @Post('installments/:installmentId/settle')
  @Roles(Role.OPERATOR, Role.MANAGER)
  @ApiOperation({ summary: 'Settle an installment in full (base + charges)' })
  settle(
    @Param('installmentId') installmentId: string,
    @Body() dto: SettleInstallmentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.payments.settleInstallment(installmentId, dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List payments' })
  list(@Query() query: PaymentQueryDto) {
    return this.payments.list(query);
  }
}
