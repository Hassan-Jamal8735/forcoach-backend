import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccessService } from './access.service';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [SupabaseModule],
  providers: [AccessService, SubscriptionGuard],
  exports: [AccessService, SubscriptionGuard],
})
export class AccessModule {}
