import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, AdminGuard],
  exports: [SupabaseAuthGuard, AdminGuard],
})
export class AuthModule {}
