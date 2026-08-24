import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';
import { AdminReplyDto } from './dto/admin-reply.dto';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview() {
    return this.adminService.getOverview();
  }

  @Get('users')
  users() {
    return this.adminService.listUsers();
  }

  @Get('support/threads')
  threads() {
    return this.adminService.listSupportThreads();
  }

  @Get('support/threads/:userId/messages')
  threadMessages(@Param('userId') userId: string) {
    return this.adminService.getThreadMessages(userId);
  }

  @Post('support/threads/:userId/messages')
  reply(@Param('userId') userId: string, @Body() dto: AdminReplyDto) {
    return this.adminService.sendAdminMessage(userId, dto.body);
  }

  @Post('support/threads/:userId/read')
  markRead(@Param('userId') userId: string) {
    return this.adminService.markThreadReadByAdmin(userId);
  }
}
