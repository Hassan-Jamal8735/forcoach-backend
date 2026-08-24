import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { SupportService } from './support.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('support')
@UseGuards(SupabaseAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('messages')
  list(@Req() request: AuthenticatedRequest) {
    return this.supportService.listMessages(request.user.id);
  }

  @Post('messages')
  send(@Req() request: AuthenticatedRequest, @Body() dto: SendMessageDto) {
    return this.supportService.sendUserMessage(
      request.user.id,
      request.user.email ?? 'unknown',
      dto.body,
    );
  }

  @Post('messages/read')
  markRead(@Req() request: AuthenticatedRequest) {
    return this.supportService.markReadByUser(request.user.id);
  }
}
