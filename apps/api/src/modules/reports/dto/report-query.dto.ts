import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Optional date-range filter for CSV exports. Bounds are inclusive and applied
 * to each report's primary date column (createdAt / paidAt / openedAt).
 */
export class ReportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
