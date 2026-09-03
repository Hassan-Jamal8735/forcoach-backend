import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const LIMIT_PER_CATEGORY = 5;

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchResults = {
  studios: SearchResultItem[];
  events: SearchResultItem[];
  invoices: SearchResultItem[];
};

@Injectable()
export class SearchService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async search(userId: string, query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { studios: [], events: [], invoices: [] };

    const client = this.supabaseService.getClient();
    const like = `%${q}%`;

    const [studios, events, invoices] = await Promise.all([
      client
        .from('studios')
        .select('id, name, address')
        .eq('user_id', userId)
        .ilike('name', like)
        .order('name', { ascending: true })
        .limit(LIMIT_PER_CATEGORY),
      client
        .from('events')
        .select('id, title, location, start_time')
        .eq('user_id', userId)
        .or(`title.ilike.${like},location.ilike.${like}`)
        .order('start_time', { ascending: false })
        .limit(LIMIT_PER_CATEGORY),
      client
        .from('invoices')
        .select('id, invoice_number, studio_name')
        .eq('user_id', userId)
        .or(`invoice_number.ilike.${like},studio_name.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(LIMIT_PER_CATEGORY),
    ]);

    if (studios.error) throw studios.error;
    if (events.error) throw events.error;
    if (invoices.error) throw invoices.error;

    return {
      studios: (studios.data ?? []).map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: s.address,
        href: '/studios',
      })),
      events: (events.data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.location,
        href: `/calendar?date=${e.start_time.slice(0, 10)}`,
      })),
      invoices: (invoices.data ?? []).map((i) => ({
        id: i.id,
        title: i.invoice_number ?? 'Draft invoice',
        subtitle: i.studio_name,
        href: `/invoices/${i.id}`,
      })),
    };
  }
}
