import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AmortizationType, ProposalStatus } from '../../../generated/prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class SimulateProposalDto {
  @ApiProperty({ enum: AmortizationType, default: AmortizationType.PRICE })
  @IsEnum(AmortizationType)
  amortizationType!: AmortizationType;

  @ApiProperty({ example: 10000, description: 'Requested amount (cash to the customer)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  requestedAmount!: number;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(420)
  termMonths!: number;

  @ApiProperty({ example: 0.025, description: 'Monthly interest rate as a fraction (0.025 = 2.5%/mo)' })
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(2)
  interestRate!: number;

  @ApiPropertyOptional({ description: 'Override IOF; if omitted and autoIof=true it is estimated' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  iofAmount?: number;

  @ApiPropertyOptional({ description: 'Opening fee (TAC)', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tacAmount?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoIof?: boolean;
}

export class CreateProposalDto extends SimulateProposalDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  purpose?: string;
}

export class ProposalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProposalStatus })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class CancelProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
