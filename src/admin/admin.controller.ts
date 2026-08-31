import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';
import { AdminBillingService } from './admin-billing.service';
import { AdminReplyDto } from './dto/admin-reply.dto';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminBillingService: AdminBillingService,
  ) {}

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

  @Get('billing/promo-codes')
  listPromoCodes() {
    return this.adminBillingService.listPromoCodes();
  }

  @Post('billing/promo-codes')
  createPromoCode(@Body() dto: CreatePromoCodeDto) {
    return this.adminBillingService.createPromoCode(dto);
  }

  @Delete('billing/promo-codes/:id')
  deactivatePromoCode(@Param('id') id: string) {
    return this.adminBillingService.deactivatePromoCode(id);
  }
}
