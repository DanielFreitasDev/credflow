import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AmortizationType, CollectionStatus, InteractionChannel } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CollectionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CollectionStatus })
  @IsOptional()
  @IsEnum(CollectionStatus)
  status?: CollectionStatus;
}

export class CreateInteractionDto {
  @ApiProperty({ enum: InteractionChannel })
  @IsEnum(InteractionChannel)
  channel!: InteractionChannel;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  notes!: string;
}

export class CreatePromiseDto {
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsISO8601()
  promisedDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdatePromiseDto {
  @ApiProperty({ enum: ['KEPT', 'BROKEN', 'CANCELLED'] })
  @IsEnum({ KEPT: 'KEPT', BROKEN: 'BROKEN', CANCELLED: 'CANCELLED' })
  status!: 'KEPT' | 'BROKEN' | 'CANCELLED';
}

export class UpdateCaseStatusDto {
  @ApiProperty({ enum: CollectionStatus })
  @IsEnum(CollectionStatus)
  status!: CollectionStatus;
}

export class RenegotiateDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(420)
  termMonths!: number;

  @ApiPropertyOptional({ description: 'New monthly rate (fraction). Defaults to the original.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(2)
  interestRate?: number;

  @ApiPropertyOptional({ enum: AmortizationType })
  @IsOptional()
  @IsEnum(AmortizationType)
  amortizationType?: AmortizationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  firstDueDate?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
