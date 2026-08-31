import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * One Stripe client shared by BillingService (coach-facing checkout/portal)
 * and AdminBillingService (promo codes, discount lookups) rather than each
 * constructing its own — same API key, same config, no reason to duplicate.
 */
@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(config: ConfigService) {
    this.client = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
  }
}
