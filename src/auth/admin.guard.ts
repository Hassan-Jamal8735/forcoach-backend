import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from './supabase-auth.guard';

/**
 * Runs after SupabaseAuthGuard, so request.user is already set. Access is
 * gated on a single configured email rather than a role stored in the
 * database — there's exactly one admin (Aya), so this avoids a whole
 * roles/permissions system for a single fixed account.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const adminEmail = this.config.get<string>(
      'ADMIN_EMAIL',
      'contact@forcoach.io',
    );
    return request.user?.email === adminEmail;
  }
}
