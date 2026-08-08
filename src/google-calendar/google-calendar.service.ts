import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { SupabaseService } from '../supabase/supabase.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { SelectCalendarDto } from './dto/select-calendar.dto';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
// Widened from 90 -> 180 days: this window is re-fetched on every sync (not just
// the first one), so a longer lookback gives more headroom to recover history if
// a connection is ever dropped and reconnected later. Events already imported are
// never deleted by sync regardless of this window (see the insert/update-only
// logic below), so this only affects how far back a fresh/reconnected sync reaches.
const SYNC_LOOKBACK_DAYS = 180;
const SYNC_LOOKAHEAD_DAYS = 180;

type CalendarConnectionInsert = TablesInsert<'calendar_connections'>;
type CalendarConnectionUpdate = TablesUpdate<'calendar_connections'>;
type EventInsert = TablesInsert<'events'>;
type ImportActivityInsert = TablesInsert<'import_activity'>;
type ImportActivityUpdate = TablesUpdate<'import_activity'>;

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly stateService: GoogleOAuthStateService,
  ) {}

  private buildOAuthClient() {
    return new google.auth.OAuth2(
      this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  buildAuthUrl(userId: string): string {
    const client = this.buildOAuthClient();
    const state = this.stateService.create(userId);
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [SCOPE],
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const userId = this.stateService.consume(state);
    if (!userId)
      throw new BadRequestException('Invalid or expired OAuth state');

    const client = this.buildOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Revoke FORCOACH access at myaccount.google.com/permissions and try connecting again.',
      );
    }

    const row: CalendarConnectionInsert = {
      user_id: userId,
      provider: 'google',
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
    };

    const client_ = this.supabaseService.getClient();
    const { data: existing } = await client_
      .from('calendar_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();

    if (existing) {
      const { error } = await client_
        .from('calendar_connections')
        .update(row)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await client_.from('calendar_connections').insert(row);
      if (error) throw error;
    }
  }

  private async getConnection(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private authorizedClient(refreshToken: string) {
    const client = this.buildOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  async getStatus(userId: string) {
    const connection = await this.getConnection(userId);
    if (!connection) return { connected: false as const };
    return {
      connected: true as const,
      calendarId: connection.calendar_id,
      calendarName: connection.calendar_name,
      googleAccountEmail: connection.google_account_email,
      lastSyncedAt: connection.last_synced_at,
      defaultStudioId: connection.default_studio_id,
    };
  }

  async listCalendars(userId: string) {
    const connection = await this.getConnection(userId);
    if (!connection) throw new NotFoundException('No Google connection found');

    const auth = this.authorizedClient(connection.refresh_token);
    const calendar = google.calendar({ version: 'v3', auth });
    const { data } = await calendar.calendarList.list();

    return (data.items ?? [])
      .filter(
        (item) => !item.id?.endsWith('#holiday@group.v.calendar.google.com'),
      )
      .map((item) => ({
        id: item.id,
        name: item.summary,
        primary: item.primary ?? false,
      }));
  }

  async selectCalendar(userId: string, dto: SelectCalendarDto) {
    const connection = await this.getConnection(userId);
    if (!connection) throw new NotFoundException('No Google connection found');

    const update: CalendarConnectionUpdate = {
      calendar_id: dto.calendarId,
      calendar_name: dto.calendarName,
      google_account_email: dto.calendarId.includes('@')
        ? dto.calendarId
        : null,
      default_studio_id: dto.defaultStudioId ?? null,
    };
    const { error } = await this.supabaseService
      .getClient()
      .from('calendar_connections')
      .update(update)
      .eq('id', connection.id);
    if (error) throw error;

    return this.sync(userId);
  }

  /**
   * Changes the studio that newly-synced events are assigned to. Only affects
   * future syncs — existing events keep whatever they already have, so this
   * can't silently rewrite a schedule the user has already sorted out by hand.
   */
  async setDefaultStudio(userId: string, studioId: string | null) {
    const connection = await this.getConnection(userId);
    if (!connection) throw new NotFoundException('No Google connection found');

    const client = this.supabaseService.getClient();

    if (studioId) {
      const { data: studio, error: studioError } = await client
        .from('studios')
        .select('id')
        .eq('id', studioId)
        .eq('user_id', userId)
        .maybeSingle();
      if (studioError) throw studioError;
      if (!studio) throw new NotFoundException('Studio not found');
    }

    const { error } = await client
      .from('calendar_connections')
      .update({ default_studio_id: studioId })
      .eq('id', connection.id);
    if (error) throw error;

    return { success: true, defaultStudioId: studioId };
  }

  async sync(userId: string) {
    const connection = await this.getConnection(userId);
    if (!connection) throw new NotFoundException('No Google connection found');
    if (!connection.calendar_id) {
      throw new BadRequestException('No calendar selected yet');
    }

    const client_ = this.supabaseService.getClient();
    const activityInsert: ImportActivityInsert = {
      user_id: userId,
      source: 'google_calendar',
      status: 'running',
      records_processed: 0,
    };
    const { data: activity, error: activityError } = await client_
      .from('import_activity')
      .insert(activityInsert)
      .select()
      .single();
    if (activityError) throw activityError;

    try {
      const auth = this.authorizedClient(connection.refresh_token);
      const calendar = google.calendar({ version: 'v3', auth });

      const timeMin = new Date(
        Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const timeMax = new Date(
        Date.now() + SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const items: calendar_v3.Schema$Event[] = [];
      let pageToken: string | undefined;
      do {
        const { data } = await calendar.events.list({
          calendarId: connection.calendar_id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken,
        });
        items.push(...(data.items ?? []));
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);

      const usable = items.filter(
        (item) => item.id && item.status !== 'cancelled',
      );
      const externalIds = usable.map((item) => item.id!);

      const { data: existingRows, error: existingError } = await client_
        .from('events')
        .select('id, external_id')
        .eq('user_id', userId)
        .eq('source', 'google_calendar')
        .in('external_id', externalIds.length > 0 ? externalIds : ['__none__']);
      if (existingError) throw existingError;

      const existingByExternalId = new Map(
        (existingRows ?? []).map((row) => [row.external_id, row.id]),
      );

      let created = 0;
      let updated = 0;
      const toInsert: EventInsert[] = [];

      for (const item of usable) {
        const start = item.start?.dateTime ?? item.start?.date;
        const end = item.end?.dateTime ?? item.end?.date;
        if (!start || !end) continue;

        const fields = {
          title: item.summary ?? '(untitled)',
          description: item.description ?? null,
          location: item.location ?? null,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
        };

        const existingId = existingByExternalId.get(item.id!);
        if (existingId) {
          const { error } = await client_
            .from('events')
            .update(fields)
            .eq('id', existingId);
          if (error) throw error;
          updated += 1;
        } else {
          toInsert.push({
            user_id: userId,
            source: 'google_calendar',
            external_id: item.id!,
            studio_id: connection.default_studio_id,
            status: connection.default_studio_id ? 'assigned' : 'unassigned',
            ...fields,
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await client_.from('events').insert(toInsert);
        if (error) throw error;
        created = toInsert.length;
      }

      const finishedAt = new Date().toISOString();
      const finalUpdate: ImportActivityUpdate = {
        status: 'success',
        records_processed: usable.length,
        records_created: created,
        records_updated: updated,
        records_skipped: 0,
        finished_at: finishedAt,
      };
      const { data: finishedActivity, error: finishError } = await client_
        .from('import_activity')
        .update(finalUpdate)
        .eq('id', activity.id)
        .select()
        .single();
      if (finishError) throw finishError;

      await client_
        .from('calendar_connections')
        .update({ last_synced_at: finishedAt })
        .eq('id', connection.id);

      return { activity: finishedActivity, created, updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      await client_
        .from('import_activity')
        .update({
          status: 'failed',
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', activity.id);
      throw err;
    }
  }

  async disconnect(userId: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('calendar_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'google');
    if (error) throw error;
    return { success: true };
  }
}
