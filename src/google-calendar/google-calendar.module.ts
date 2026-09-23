import { AccessModule } from '../access/access.module';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { GoogleCalendarSyncScheduler } from './google-calendar-sync.scheduler';

@Module({
  imports: [SupabaseModule, AuthModule, AccessModule],
  controllers: [GoogleAuthController, GoogleCalendarController],
  providers: [
    GoogleCalendarService,
    GoogleOAuthStateService,
    GoogleCalendarSyncScheduler,
  ],
})
export class GoogleCalendarModule {}
