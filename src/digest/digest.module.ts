import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { EarningsModule } from '../earnings/earnings.module';
import { SupportModule } from '../support/support.module';
import { DigestScheduler } from './digest.scheduler';

@Module({
  imports: [SupabaseModule, EarningsModule, SupportModule],
  providers: [DigestScheduler],
})
export class DigestModule {}
