import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class EarningsSummaryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class EarningsTimeseriesQueryDto extends EarningsSummaryQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}
