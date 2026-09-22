import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { EarningsService } from '../earnings/earnings.service';
import { MailService } from '../support/mail.service';

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
};

function money(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  return `${symbol}${amount.toFixed(2)}`;
}

@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly earningsService: EarningsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  // Disabled per Aya's request. Left in place (not deleted) in case the
  // weekly digest is turned back on later — just re-import Cron from
  // '@nestjs/schedule' and re-add `@Cron('0 8 * * 1')` above this method.
  async sendWeeklyDigests() {
    const adminEmail = this.config.get<string>(
      'ADMIN_EMAIL',
      'contact@forcoach.io',
    );
    const client = this.supabaseService.getClient();

    const { data: usersPage, error } = await client.auth.admin.listUsers();
    if (error) {
      this.logger.error(`Failed to list users: ${error.message}`);
      return;
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let sent = 0;
    for (const user of usersPage.users) {
      if (!user.email || user.email === adminEmail) continue;

      try {
        const fullName =
          (user.user_metadata?.full_name as string | undefined) ?? '';
        const currency =
          (user.user_metadata?.currency as string | undefined) ?? 'EUR';

        const summary = await this.earningsService.summary(
          user.id,
          weekAgo.toISOString(),
          now.toISOString(),
        );

        const { data: upcoming, error: upcomingError } = await client
          .from('events')
          .select('title, start_time')
          .eq('user_id', user.id)
          .eq('status', 'assigned')
          .gte('start_time', now.toISOString())
          .lte('start_time', weekAhead.toISOString())
          .order('start_time', { ascending: true });
        if (upcomingError) throw upcomingError;

        const { count: draftInvoiceCount, error: draftError } = await client
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'draft');
        if (draftError) throw draftError;

        // Nothing to report — skip rather than send an empty, noisy email
        // (e.g. an account that never got set up, or one that's been
        // completely quiet for the week).
        const upcomingCount = upcoming?.length ?? 0;
        if (
          summary.classCount === 0 &&
          upcomingCount === 0 &&
          !draftInvoiceCount
        ) {
          continue;
        }

        const lines: string[] = [];
        lines.push(`Hi ${fullName || 'there'},`);
        lines.push('');
        lines.push("Here's your FORCOACH weekly digest.");
        lines.push('');
        lines.push('LAST 7 DAYS');
        lines.push(
          `- Earned: ${money(summary.totalEarnings, currency)} across ${summary.classCount} class${summary.classCount === 1 ? '' : 'es'}`,
        );
        if (summary.bestStudio) {
          lines.push(`- Best studio: ${summary.bestStudio}`);
        }
        if (summary.pendingCount > 0) {
          lines.push(
            `- ${summary.pendingCount} class${summary.pendingCount === 1 ? '' : 'es'} still unassigned to a studio`,
          );
        }
        lines.push('');
        lines.push('NEXT 7 DAYS');
        if (upcomingCount === 0) {
          lines.push('- No classes scheduled yet.');
        } else {
          for (const e of (upcoming ?? []).slice(0, 5)) {
            const when = new Date(e.start_time).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            lines.push(`- ${when} — ${e.title}`);
          }
          if (upcomingCount > 5) {
            lines.push(`- ...and ${upcomingCount - 5} more`);
          }
        }
        if (draftInvoiceCount) {
          lines.push('');
          lines.push(
            `You have ${draftInvoiceCount} draft invoice${draftInvoiceCount === 1 ? '' : 's'} waiting to be generated.`,
          );
        }
        lines.push('');
        lines.push('Open FORCOACH: https://forcoach.io/dashboard');

        await this.mailService.send(
          user.email,
          'Your weekly FORCOACH digest',
          lines.join('\n'),
        );
        sent += 1;
      } catch (err) {
        this.logger.error(
          `Digest failed for user ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(`Sent ${sent} weekly digest email(s)`);
  }
}
