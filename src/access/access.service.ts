import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Same access rule as BillingService.getStatus().hasAccess, kept separate
 * (DB only, no Stripe) so any module can use it without pulling in billing.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async hasAccess(userId: string, email: string | undefined): Promise<boolean> {
    if (this.config.get<string>('ENFORCE_SUBSCRIPTION', 'false') !== 'true') {
      return true;
    }
    if (
      email &&
      email === this.config.get<string>('ADMIN_EMAIL', 'contact@forcoach.io')
    ) {
      return true;
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('subscriptions')
      .select('status, admin_override_until')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const overrideActive =
      !!data.admin_override_until &&
      new Date(data.admin_override_until).getTime() > Date.now();
    return (
      overrideActive || data.status === 'active' || data.status === 'trialing'
    );
  }
}
