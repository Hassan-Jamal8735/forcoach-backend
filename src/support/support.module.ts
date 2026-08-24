import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { MailService } from './mail.service';

@Module({
  imports: [AuthModule],
  controllers: [SupportController],
  providers: [SupportService, MailService],
  exports: [MailService],
})
export class SupportModule {}
