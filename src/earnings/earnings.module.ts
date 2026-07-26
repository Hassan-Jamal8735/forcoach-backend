import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [EarningsController],
  providers: [EarningsService],
})
export class EarningsModule {}
