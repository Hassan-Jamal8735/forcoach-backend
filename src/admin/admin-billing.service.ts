import { Injectable } from '@nestjs/common';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class AdminBillingService {
  constructor(private readonly stripeService: StripeService) {}

  private get stripe() {
    return this.stripeService.client;
  }

  /**
   * Every promotion code, newest first, with its coupon terms flattened
   * onto it — the admin UI only ever needs to show "code -> discount",
   * never the raw coupon/promotion-code split Stripe models internally.
   */
  async listPromoCodes() {
    const codes = await this.stripe.promotionCodes.list({
      limit: 100,
      expand: ['data.promotion.coupon'],
    });

    return codes.data.map((pc) => {
      const rawCoupon = pc.promotion.coupon;
      const coupon = typeof rawCoupon === 'string' ? null : rawCoupon;
      return {
        id: pc.id,
        code: pc.code,
        active: pc.active,
        percentOff: coupon?.percent_off ?? null,
        amountOff: coupon?.amount_off ?? null,
        currency: coupon?.currency ?? null,
        duration: coupon?.duration ?? null,
        durationInMonths: coupon?.duration_in_months ?? null,
        timesRedeemed: pc.times_redeemed,
        maxRedemptions: pc.max_redemptions ?? null,
        createdAt: new Date(pc.created * 1000).toISOString(),
      };
    });
  }

  async createPromoCode(params: {
    code: string;
    percentOff: number;
    duration: 'once' | 'repeating' | 'forever';
    durationInMonths?: number;
    maxRedemptions?: number;
  }) {
    const coupon = await this.stripe.coupons.create({
      percent_off: params.percentOff,
      duration: params.duration,
      duration_in_months:
        params.duration === 'repeating' ? params.durationInMonths : undefined,
      name: params.code,
    });

    const promotionCode = await this.stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: params.code,
      max_redemptions: params.maxRedemptions,
    });

    return { id: promotionCode.id, code: promotionCode.code };
  }

  /**
   * Promotion codes can't be deleted in Stripe, only deactivated — this
   * stops it from being redeemed again without breaking anyone already
   * using it.
   */
  async deactivatePromoCode(id: string) {
    await this.stripe.promotionCodes.update(id, { active: false });
    return { success: true };
  }
}
