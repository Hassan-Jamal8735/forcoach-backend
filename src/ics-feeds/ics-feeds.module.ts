import { AccessModule } from '../access/access.module';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { IcsFeedsController } from './ics-feeds.controller';
import { IcsFeedsService } from './ics-feeds.service';
import { IcsFeedsSyncScheduler } from './ics-feeds-sync.scheduler';

@Module({
  imports: [SupabaseModule, AuthModule, AccessModule],
  controllers: [IcsFeedsController],
  providers: [IcsFeedsService, IcsFeedsSyncScheduler],
})
export class IcsFeedsModule {}
