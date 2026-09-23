import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';
import { isAllowedAppReturnUrl, withQuery } from '../common/app-return';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  // `returnTo` is set by the mobile app so the flow ends back in the app
  // instead of on the website (where the coach isn't logged in).
  @Get('connect')
  @UseGuards(SupabaseAuthGuard)
  connect(
    @Req() request: AuthenticatedRequest,
    @Query('returnTo') returnTo: string | undefined,
  ) {
    const safeReturnTo = isAllowedAppReturnUrl(returnTo) ? returnTo : null;
    return {
      url: this.googleCalendarService.buildAuthUrl(
        request.user.id,
        safeReturnTo,
      ),
    };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const entry = state ? this.googleCalendarService.consumeState(state) : null;

    const finish = (outcome: 'connected' | 'error') =>
      entry?.returnTo
        ? res.redirect(withQuery(entry.returnTo, { google: outcome }))
        : res.redirect(`${webOrigin}/calendar?google=${outcome}`);

    if (error || !code || !entry) return finish('error');

    try {
      await this.googleCalendarService.handleCallback(code, entry.userId);
      return finish('connected');
    } catch {
      return finish('error');
    }
  }
}
