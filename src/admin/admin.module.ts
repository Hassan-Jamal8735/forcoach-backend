import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminBillingService } from './admin-billing.service';

@Module({
  imports: [AuthModule, SupabaseModule, StripeModule],
  controllers: [AdminController],
  providers: [AdminService, AdminBillingService],
})
export class AdminModule {}
