import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { EarningsService } from './earnings.service';
import {
  EarningsSummaryQueryDto,
  EarningsTimeseriesQueryDto,
} from './dto/earnings-query.dto';

@Controller('earnings')
@UseGuards(SupabaseAuthGuard)
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('summary')
  summary(
    @Req() request: AuthenticatedRequest,
    @Query() query: EarningsSummaryQueryDto,
  ) {
    return this.earningsService.summary(request.user.id, query.from, query.to);
  }

  @Get('timeseries')
  timeseries(
    @Req() request: AuthenticatedRequest,
    @Query() query: EarningsTimeseriesQueryDto,
  ) {
    return this.earningsService.timeseries(
      request.user.id,
      query.from,
      query.to,
      query.granularity,
    );
  }
}
