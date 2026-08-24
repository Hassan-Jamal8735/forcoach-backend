import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { MailService } from './mail.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [SupportController],
  providers: [SupportService, MailService],
  exports: [MailService],
})
export class SupportModule {}
