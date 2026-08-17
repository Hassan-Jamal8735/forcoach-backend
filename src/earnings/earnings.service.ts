import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveTierRate, type RateTier } from '../studios/rate-tiers';

type StudioRate = {
  id: string;
  name: string;
  compensation_type: string;
  compensation_value: number;
  rate_tiers?: RateTier[];
};

type EventRow = {
  id: string;
  studio_id: string | null;
  start_time: string;
  end_time: string;
  status: string;
  rate_override: number | null;
  attendance_count: number | null;
};

// Returns null when a tiered studio's class can't be priced yet (no
// attendance entered, or none of its brackets cover the count) — callers
// must treat that as "not counted" rather than guessing a number.
function eventAmount(event: EventRow, studio: StudioRate): number | null {
  const hours =
    (new Date(event.end_time).getTime() -
      new Date(event.start_time).getTime()) /
    (1000 * 60 * 60);

  if (studio.compensation_type === 'tiered') {
    if (event.rate_override != null) return event.rate_override;
    const rate = resolveTierRate(
      studio.rate_tiers ?? [],
      event.attendance_count,
    );
    return rate;
  }

  // A per-class override replaces the studio's rate but keeps its rate *type*,
  // so an hourly studio still multiplies by duration.
  const rate = event.rate_override ?? studio.compensation_value;
  return studio.compensation_type === 'hourly' ? hours * rate : rate;
}

function eventHours(event: EventRow): number {
  return (
    (new Date(event.end_time).getTime() -
      new Date(event.start_time).getTime()) /
    (1000 * 60 * 60)
  );
}

@Injectable()
export class EarningsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private defaultRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getFullYear(), end.getMonth(), 1);
    return { start, end };
  }

  private async loadAssignedEvents(userId: string, start: Date, end: Date) {
    const client = this.supabaseService.getClient();
    const { data: events, error: eventsError } = await client
      .from('events')
      .select(
        'id, studio_id, start_time, end_time, status, rate_override, attendance_count',
      )
      .eq('user_id', userId)
      .eq('status', 'assigned')
      .not('studio_id', 'is', null)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString());
    if (eventsError) throw eventsError;

    const { data: studios, error: studiosError } = await client
      .from('studios')
      .select(
        'id, name, compensation_type, compensation_value, rate_tiers:studio_rate_tiers(min_attendance, max_attendance, rate)',
      )
      .eq('user_id', userId);
    if (studiosError) throw studiosError;

    const studioById = new Map(studios.map((s) => [s.id, s]));
    return { events: events as EventRow[], studioById };
  }

  async summary(userId: string, from?: string, to?: string) {
    const { start, end } = this.defaultRange(from, to);
    const { events, studioById } = await this.loadAssignedEvents(
      userId,
      start,
      end,
    );

    let totalHours = 0;
    let totalEarnings = 0;
    let pendingAttendanceCount = 0;
    const perStudio = new Map<
      string,
      {
        studioId: string;
        studioName: string;
        hours: number;
        earnings: number;
        classCount: number;
      }
    >();

    for (const event of events) {
      const studio = event.studio_id
        ? studioById.get(event.studio_id)
        : undefined;
      if (!studio) continue;
      const hours = eventHours(event);
      const amount = eventAmount(event, studio);
      // A tiered studio's class with no attendance entered yet (or none of
      // its brackets cover the count) can't be priced — count the class and
      // its hours, but leave it out of earnings rather than guessing.
      if (amount == null) pendingAttendanceCount += 1;
      totalHours += hours;
      totalEarnings += amount ?? 0;

      const entry = perStudio.get(studio.id) ?? {
        studioId: studio.id,
        studioName: studio.name,
        hours: 0,
        earnings: 0,
        classCount: 0,
      };
      entry.hours += hours;
      entry.earnings += amount ?? 0;
      entry.classCount += 1;
      perStudio.set(studio.id, entry);
    }

    const studioBreakdown = Array.from(perStudio.values()).sort(
      (a, b) => b.earnings - a.earnings,
    );
    const bestStudio = studioBreakdown[0]?.studioName ?? null;
    const classCount = events.length;
    // Priced classes only, so classes still waiting on attendance don't drag
    // the average down toward zero.
    const pricedClassCount = classCount - pendingAttendanceCount;
    const avgClassRate =
      pricedClassCount > 0 ? totalEarnings / pricedClassCount : 0;

    const client = this.supabaseService.getClient();
    const { count: pendingCount, error: pendingError } = await client
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'unassigned')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString());
    if (pendingError) throw pendingError;

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      totalHours,
      totalEarnings,
      classCount,
      avgClassRate,
      bestStudio,
      pendingCount: pendingCount ?? 0,
      pendingAttendanceCount,
      studioBreakdown,
    };
  }

  async timeseries(
    userId: string,
    from?: string,
    to?: string,
    granularity: 'day' | 'week' | 'month' = 'month',
  ) {
    const { start, end } = this.defaultRange(from, to);
    const { events, studioById } = await this.loadAssignedEvents(
      userId,
      start,
      end,
    );

    const buckets = new Map<string, { earnings: number; hours: number }>();

    function bucketKey(date: Date): string {
      if (granularity === 'day') {
        return date.toISOString().slice(0, 10);
      }
      if (granularity === 'week') {
        const d = new Date(date);
        const day = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - day);
        return d.toISOString().slice(0, 10);
      }
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    for (const event of events) {
      const studio = event.studio_id
        ? studioById.get(event.studio_id)
        : undefined;
      if (!studio) continue;
      const key = bucketKey(new Date(event.start_time));
      const entry = buckets.get(key) ?? { earnings: 0, hours: 0 };
      entry.earnings += eventAmount(event, studio) ?? 0;
      entry.hours += eventHours(event);
      buckets.set(key, entry);
    }

    const points = Array.from(buckets.entries())
      .map(([bucket, values]) => ({ bucket, ...values }))
      .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

    return { granularity, points };
  }
}
