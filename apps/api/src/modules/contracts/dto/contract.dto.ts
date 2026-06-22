import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContractStatus } from '../../../generated/prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateContractDto {
  @ApiPropertyOptional({ description: 'Contract start date (defaults to today)' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'First installment due date (defaults to start + 1 month)' })
  @IsOptional()
  @IsISO8601()
  firstDueDate?: string;

  @ApiPropertyOptional({ description: 'One-time late fine rate (fraction). Default 0.02 (2%)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  lateFeeRate?: number;

  @ApiPropertyOptional({ description: 'Monthly arrears interest (fraction). Default 0.01 (1%/mo)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  lateInterestRate?: number;
}

export class ContractQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}
