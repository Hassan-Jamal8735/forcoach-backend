import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';

type SubscriptionStatus =
  'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type Plan = 'monthly' | 'yearly';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;
  private readonly priceIds: Record<Plan, string>;
  private readonly webOrigin: string;

  constructor(
    private readonly config: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {
    this.stripe = this.stripeService.client;
    this.priceIds = {
      monthly: this.config.getOrThrow<string>('STRIPE_PRICE_ID_MONTHLY'),
      yearly: this.config.getOrThrow<string>('STRIPE_PRICE_ID_YEARLY'),
    };
    this.webOrigin = this.config.get<string>(
      'WEB_ORIGIN',
      'http://localhost:3000',
    );
  }

  /** Whether an inactive subscription should actually block access yet. */
  private isEnforced(): boolean {
    return this.config.get<string>('ENFORCE_SUBSCRIPTION', 'false') === 'true';
  }

  private async getRow(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Every coach gets exactly one Stripe customer, created the first time
   * they start checkout. Reused on every later checkout/portal call rather
   * than creating a new one each time.
   */
  private async getOrCreateCustomer(
    userId: string,
    email: string,
  ): Promise<string> {
    const existing = await this.getRow(userId);
    if (existing) return existing.stripe_customer_id;

    const customer = await this.stripe.customers.create({
      email,
      metadata: { forcoach_user_id: userId },
    });

    const { error } = await this.supabaseService
      .getClient()
      .from('subscriptions')
      .insert({
        user_id: userId,
        stripe_customer_id: customer.id,
        status: 'incomplete',
      });
    if (error) throw error;

    return customer.id;
  }

  async createCheckoutSession(userId: string, email: string, plan: Plan) {
    const customerId = await this.getOrCreateCustomer(userId, email);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: this.priceIds[plan], quantity: 1 }],
      // Lets a coach type a promo code Aya created directly in the Stripe
      // dashboard (e.g. 100%-off-forever for a beta tester) — no custom
      // promo-code UI needed on our side.
      allow_promotion_codes: true,
      success_url: `${this.webOrigin}/settings?billing=success`,
      cancel_url: `${this.webOrigin}/settings?billing=cancelled`,
      subscription_data: { metadata: { forcoach_user_id: userId } },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { url: session.url };
  }

  async createPortalSession(userId: string) {
    const row = await this.getRow(userId);
    if (!row) {
      throw new BadRequestException('No billing account yet — subscribe first');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${this.webOrigin}/settings`,
    });
    return { url: session.url };
  }

  async getStatus(userId: string) {
    const row = await this.getRow(userId);
    const status = (row?.status as SubscriptionStatus | undefined) ?? 'none';
    const enforced = this.isEnforced();
    const hasAccess = !enforced || status === 'active' || status === 'trialing';

    return {
      status,
      currentPeriodEnd: row?.current_period_end ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      promoCode: row?.promo_code ?? null,
      discountPercentOff: row?.discount_percent_off ?? null,
      plan: (row?.plan as Plan | undefined) ?? null,
      enforced,
      hasAccess,
    };
  }

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Keeps our subscriptions row in sync with Stripe. Always matched by
   * stripe_customer_id — every row is created with one at checkout time, so
   * every subscription event has somewhere to land.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription =
          event.type === 'checkout.session.completed'
            ? await this.resolveSubscriptionFromSession(event.data.object)
            : event.data.object;
        if (subscription) await this.upsertFromSubscription(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await this.upsertFromSubscription(subscription);
        break;
      }
      default:
        // Not every Stripe event matters to us — anything else is ignored.
        break;
    }
  }

  private async resolveSubscriptionFromSession(
    session: Stripe.Checkout.Session,
  ): Promise<Stripe.Subscription | null> {
    if (!session.subscription) return null;
    const id =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;
    return this.stripe.subscriptions.retrieve(id);
  }

  private async upsertFromSubscription(subscription: Stripe.Subscription) {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const item = subscription.items.data[0];
    const periodEndTs = item?.current_period_end;
    const discount = await this.resolveDiscount(subscription.id);
    // Derived from the interval rather than matching against our configured
    // price IDs, so an old/renamed price still resolves correctly.
    const interval = item?.price.recurring?.interval;
    const plan: Plan | null =
      interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null;

    const { error } = await this.supabaseService
      .getClient()
      .from('subscriptions')
      .update({
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_end: periodEndTs
          ? new Date(periodEndTs * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        promo_code: discount?.code ?? null,
        discount_percent_off: discount?.percentOff ?? null,
        discount_duration: discount?.duration ?? null,
        plan,
      })
      .eq('stripe_customer_id', customerId);

    if (error) throw error;
    this.logger.log(
      `Subscription ${subscription.id} for customer ${customerId} -> ${subscription.status}`,
    );
  }

  /**
   * Re-fetches with discounts expanded — webhook payloads don't reliably
   * carry expanded coupon/promotion-code text, so this normalizes it
   * regardless of which event triggered the update.
   */
  private async resolveDiscount(subscriptionId: string): Promise<{
    code: string | null;
    percentOff: number | null;
    duration: string | null;
  } | null> {
    const fresh = await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['discounts.source.coupon', 'discounts.promotion_code'],
    });
    const discount = fresh.discounts?.[0];
    if (!discount || typeof discount === 'string') return null;

    const rawCoupon = discount.source.coupon;
    const coupon = typeof rawCoupon === 'string' ? null : rawCoupon;
    const promotionCode =
      typeof discount.promotion_code === 'string'
        ? null
        : discount.promotion_code;

    return {
      code: promotionCode?.code ?? null,
      percentOff: coupon?.percent_off ?? null,
      duration: coupon?.duration ?? null,
    };
  }
}
