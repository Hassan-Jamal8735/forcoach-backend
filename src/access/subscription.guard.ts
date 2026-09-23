import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { AccessService } from './access.service';

/**
 * Runs after SupabaseAuthGuard. Blocks the parts of the product that do real
 * work (schedule, earnings, invoices, sync) for coaches without an active plan
 * or trial — the same rule the website enforces in its middleware, but here
 * so no client (mobile, old versions) can bypass it.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly accessService: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ok = await this.accessService.hasAccess(
      request.user.id,
      request.user.email,
    );
    if (!ok) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Start your free trial or subscribe to use this feature.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
