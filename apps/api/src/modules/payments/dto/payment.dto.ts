import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  installmentId!: string;

  @ApiProperty({ example: 888.49 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.PIX })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payment date (defaults to now)' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettleInstallmentDto {
  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.PIX })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractId?: string;
}
