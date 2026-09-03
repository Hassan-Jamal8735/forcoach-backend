import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { StudiosModule } from './studios/studios.module';
import { EventsModule } from './events/events.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { IcsFeedsModule } from './ics-feeds/ics-feeds.module';
import { EarningsModule } from './earnings/earnings.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    StudiosModule,
    EventsModule,
    GoogleCalendarModule,
    IcsFeedsModule,
    EarningsModule,
    InvoicesModule,
    SupportModule,
    AdminModule,
    BillingModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
