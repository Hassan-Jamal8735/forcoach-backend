import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(SupabaseAuthGuard)
  checkout(@Req() request: AuthenticatedRequest, @Body() dto: CheckoutDto) {
    return this.billingService.createCheckoutSession(
      request.user.id,
      request.user.email ?? '',
      dto.plan,
    );
  }

  @Post('portal')
  @UseGuards(SupabaseAuthGuard)
  portal(@Req() request: AuthenticatedRequest) {
    return this.billingService.createPortalSession(request.user.id);
  }

  @Get('status')
  @UseGuards(SupabaseAuthGuard)
  status(@Req() request: AuthenticatedRequest) {
    return this.billingService.getStatus(request.user.id);
  }

  // No SupabaseAuthGuard — Stripe calls this directly, authenticated by the
  // webhook signature instead of a user session.
  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Missing signature or body');
    }
    const event = this.billingService.verifyWebhookSignature(
      request.rawBody,
      signature,
    );
    await this.billingService.handleWebhookEvent(event);
    return { received: true };
  }
}
