import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const TREND_DAYS = 30;

@Injectable()
export class AdminService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Every coach account. Reads straight from Supabase Auth rather than a
   * mirrored profiles table, since auth.users is already the source of
   * truth for signup date / last login and we'd otherwise have to keep a
   * copy in sync for no benefit.
   */
  private async listAuthUsers() {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users;
  }

  private async countAll(table: 'studios' | 'events' | 'invoices') {
    const { count, error } = await this.supabaseService
      .getClient()
      .from(table)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  async getOverview() {
    const users = await this.listAuthUsers();
    const now = Date.now();
    const newThisWeek = users.filter(
      (u) => now - new Date(u.created_at).getTime() < WEEK_MS,
    ).length;
    const newThisMonth = users.filter(
      (u) => now - new Date(u.created_at).getTime() < MONTH_MS,
    ).length;

    const [totalStudios, totalClasses, totalInvoices] = await Promise.all([
      this.countAll('studios'),
      this.countAll('events'),
      this.countAll('invoices'),
    ]);

    const { count: unreadSupportCount, error: unreadError } =
      await this.supabaseService
        .getClient()
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender', 'user')
        .is('read_at', null);
    if (unreadError) throw unreadError;

    const { count: activeSubscriptions, error: subsError } =
      await this.supabaseService
        .getClient()
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'trialing']);
    if (subsError) throw subsError;

    return {
      totalUsers: users.length,
      newUsersThisWeek: newThisWeek,
      newUsersThisMonth: newThisMonth,
      totalStudios,
      totalClasses,
      totalInvoices,
      unreadSupportCount: unreadSupportCount ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      signupTrend: this.buildSignupTrend(users),
    };
  }

  /** Daily new-signup counts for the last 30 days, oldest first. */
  private buildSignupTrend(users: { created_at: string }[]) {
    const counts = new Map<string, number>();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const days: string[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      counts.set(key, 0);
    }

    const cutoff = today.getTime() - (TREND_DAYS - 1) * DAY_MS;
    for (const u of users) {
      const t = new Date(u.created_at).getTime();
      if (t < cutoff) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
  }

  /**
   * Per-user counts are one query per user per table rather than a single
   * grouped query — Supabase's JS client doesn't support GROUP BY counts
   * without a custom RPC. Fine at the current user count (a handful of
   * beta coaches); worth revisiting with an RPC if the user base grows
   * into the hundreds.
   */
  async listUsers() {
    const client = this.supabaseService.getClient();
    const users = await this.listAuthUsers();

    return Promise.all(
      users.map(async (u) => {
        const [
          { count: studioCount },
          { count: classCount },
          { count: invoiceCount },
          { count: unreadSupportCount },
          { data: subscription },
        ] = await Promise.all([
          client
            .from('studios')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', u.id),
          client
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', u.id),
          client
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', u.id),
          client
            .from('support_messages')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', u.id)
            .eq('sender', 'user')
            .is('read_at', null),
          client
            .from('subscriptions')
            .select('status')
            .eq('user_id', u.id)
            .maybeSingle(),
        ]);

        return {
          id: u.id,
          email: u.email,
          fullName: (u.user_metadata?.full_name as string | undefined) ?? null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          studioCount: studioCount ?? 0,
          classCount: classCount ?? 0,
          invoiceCount: invoiceCount ?? 0,
          unreadSupportCount: unreadSupportCount ?? 0,
          subscriptionStatus: subscription?.status ?? 'none',
        };
      }),
    );
  }

  async listSupportThreads() {
    const client = this.supabaseService.getClient();
    const [{ data: messages, error }, users] = await Promise.all([
      client
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false }),
      this.listAuthUsers(),
    ]);
    if (error) throw error;

    const userById = new Map(users.map((u) => [u.id, u]));
    const threads = new Map<
      string,
      {
        userId: string;
        email: string;
        fullName: string | null;
        lastMessage: string;
        lastMessageAt: string;
        unreadCount: number;
      }
    >();

    for (const m of messages) {
      const existing = threads.get(m.user_id);
      if (!existing) {
        const user = userById.get(m.user_id);
        threads.set(m.user_id, {
          userId: m.user_id,
          email: user?.email ?? 'unknown',
          fullName:
            (user?.user_metadata?.full_name as string | undefined) ?? null,
          lastMessage: m.body,
          lastMessageAt: m.created_at,
          unreadCount: m.sender === 'user' && !m.read_at ? 1 : 0,
        });
      } else if (m.sender === 'user' && !m.read_at) {
        existing.unreadCount += 1;
      }
    }

    return Array.from(threads.values()).sort((a, b) =>
      a.lastMessageAt < b.lastMessageAt ? 1 : -1,
    );
  }

  async getThreadMessages(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  async sendAdminMessage(userId: string, body: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .insert({ user_id: userId, sender: 'admin', body })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markThreadReadByAdmin(userId: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('sender', 'user')
      .is('read_at', null);
    if (error) throw error;
    return { success: true };
  }
}
