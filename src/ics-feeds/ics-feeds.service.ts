import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ical from 'node-ical';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateIcsFeedDto } from './dto/create-ics-feed.dto';
import { UpdateIcsFeedDto } from './dto/update-ics-feed.dto';
import { UploadIcsDto } from './dto/upload-ics.dto';
import { parseIcsText, type ParsedIcsEvent } from './ics-parse';
import { resolveStudioForImport } from '../events/studio-matcher';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

const SYNC_LOOKBACK_DAYS = 90;
const SYNC_LOOKAHEAD_DAYS = 180;

type IcsFeedInsert = TablesInsert<'ics_feeds'>;
type IcsFeedUpdate = TablesUpdate<'ics_feeds'>;
type EventInsert = TablesInsert<'events'>;
type ImportActivityInsert = TablesInsert<'import_activity'>;
type ImportActivityUpdate = TablesUpdate<'import_activity'>;

@Injectable()
export class IcsFeedsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Imports an uploaded .ics file.
   *
   * Unlike feed sync this applies no date window: uploads exist to backfill
   * classes a live feed no longer publishes, so filtering out the past would
   * remove exactly what the user is trying to recover.
   *
   * Dedupes on the ICS UID against previously imported ICS events, so
   * re-uploading the same export updates rather than duplicating, and a file
   * overlapping a connected feed won't create second copies either.
   */
  async importUpload(userId: string, dto: UploadIcsDto) {
    const client = this.supabaseService.getClient();

    let usable: ParsedIcsEvent[];
    try {
      usable = parseIcsText(dto.content);
    } catch {
      throw new BadRequestException(
        'Could not read that .ics file. Please check it is a valid calendar export.',
      );
    }

    if (usable.length === 0) {
      throw new BadRequestException(
        'No usable classes found in that file. It may be empty, or contain only cancelled events.',
      );
    }

    if (dto.defaultStudioId) {
      const { data: studio, error: studioError } = await client
        .from('studios')
        .select('id')
        .eq('id', dto.defaultStudioId)
        .eq('user_id', userId)
        .maybeSingle();
      if (studioError) throw studioError;
      if (!studio) throw new NotFoundException('Studio not found');
    }

    const activityInsert: ImportActivityInsert = {
      user_id: userId,
      source: 'ics',
      status: 'running',
      records_processed: usable.length,
    };
    const { data: activity, error: activityError } = await client
      .from('import_activity')
      .insert(activityInsert)
      .select()
      .single();
    if (activityError) throw activityError;

    try {
      const externalIds = usable.map((e) => e.uid);
      const { data: existingRows, error: existingError } = await client
        .from('events')
        .select('id, external_id')
        .eq('user_id', userId)
        .eq('source', 'ics')
        .in('external_id', externalIds);
      if (existingError) throw existingError;

      const existingByExternalId = new Map(
        (existingRows ?? []).map((row) => [row.external_id, row.id]),
      );

      const { data: studios, error: studiosError } = await client
        .from('studios')
        .select('id, name, match_keywords')
        .eq('user_id', userId);
      if (studiosError) throw studiosError;

      let created = 0;
      let updated = 0;
      const toInsert: EventInsert[] = [];

      for (const item of usable) {
        const fields = {
          title: item.title,
          description: item.description,
          location: item.location,
          start_time: item.startTime,
          end_time: item.endTime,
        };

        const existingId = existingByExternalId.get(item.uid);
        if (existingId) {
          // Only refresh the details — studio and status are left alone so an
          // upload never undoes assignments the user already made by hand.
          const { error } = await client
            .from('events')
            .update(fields)
            .eq('id', existingId);
          if (error) throw error;
          updated += 1;
        } else {
          const studioId = resolveStudioForImport(
            studios ?? [],
            { title: item.title, location: item.location },
            dto.defaultStudioId ?? null,
          );
          toInsert.push({
            user_id: userId,
            source: 'ics',
            external_id: item.uid,
            studio_id: studioId,
            status: studioId ? 'assigned' : 'unassigned',
            ...fields,
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await client.from('events').insert(toInsert);
        if (error) throw error;
        created = toInsert.length;
      }

      const finalUpdate: ImportActivityUpdate = {
        status: 'success',
        records_processed: usable.length,
        records_created: created,
        records_updated: updated,
        records_skipped: 0,
        finished_at: new Date().toISOString(),
      };
      const { data: finished, error: finishError } = await client
        .from('import_activity')
        .update(finalUpdate)
        .eq('id', activity.id)
        .select()
        .single();
      if (finishError) throw finishError;

      return { activity: finished, created, updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      await client
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

  async list(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ics_feeds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  private async getFeed(userId: string, id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ics_feeds')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('ICS feed not found');
    return data;
  }

  async create(userId: string, dto: CreateIcsFeedDto) {
    try {
      await ical.async.fromURL(dto.url);
    } catch {
      throw new BadRequestException(
        'Could not fetch or parse that URL as an iCalendar (.ics) feed.',
      );
    }

    const row: IcsFeedInsert = {
      user_id: userId,
      url: dto.url,
      name: dto.name,
      default_studio_id: dto.defaultStudioId ?? null,
    };
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ics_feeds')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    const result = await this.sync(userId, data.id);
    return { feed: data, ...result };
  }

  async update(userId: string, id: string, dto: UpdateIcsFeedDto) {
    await this.getFeed(userId, id);

    const update: IcsFeedUpdate = {};
    if (dto.url !== undefined) update.url = dto.url;
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.defaultStudioId !== undefined)
      update.default_studio_id = dto.defaultStudioId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('ics_feeds')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(userId: string, id: string) {
    await this.getFeed(userId, id);
    const { error } = await this.supabaseService
      .getClient()
      .from('ics_feeds')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  async sync(userId: string, feedId: string) {
    const feed = await this.getFeed(userId, feedId);
    const client_ = this.supabaseService.getClient();

    const activityInsert: ImportActivityInsert = {
      user_id: userId,
      source: 'ics',
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
      const parsed = await ical.async.fromURL(feed.url);
      const timeMin = Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const timeMax = Date.now() + SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

      const isVEvent = (
        item: ical.CalendarComponent | ical.VCalendar | undefined,
      ): item is ical.VEvent => !!item && item.type === 'VEVENT';

      const usable = Object.values(parsed)
        .filter(isVEvent)
        .filter(
          (item) =>
            item.status !== 'CANCELLED' &&
            !!item.uid &&
            !!item.start &&
            !!item.end &&
            item.start.getTime() >= timeMin &&
            item.start.getTime() <= timeMax,
        );

      const externalIds = usable.map((item) => item.uid);
      const { data: existingRows, error: existingError } = await client_
        .from('events')
        .select('id, external_id')
        .eq('user_id', userId)
        .eq('source', 'ics')
        .in('external_id', externalIds.length > 0 ? externalIds : ['__none__']);
      if (existingError) throw existingError;

      const existingByExternalId = new Map(
        (existingRows ?? []).map((row) => [row.external_id, row.id]),
      );

      const { data: syncStudios, error: syncStudiosError } = await client_
        .from('studios')
        .select('id, name, match_keywords')
        .eq('user_id', userId);
      if (syncStudiosError) throw syncStudiosError;

      let created = 0;
      let updated = 0;
      const toInsert: EventInsert[] = [];

      for (const item of usable) {
        const fields = {
          title: typeof item.summary === 'string' ? item.summary : '(untitled)',
          description:
            typeof item.description === 'string' ? item.description : null,
          location: typeof item.location === 'string' ? item.location : null,
          start_time: item.start.toISOString(),
          end_time: item.end!.toISOString(),
        };

        const existingId = existingByExternalId.get(item.uid);
        if (existingId) {
          const { error } = await client_
            .from('events')
            .update(fields)
            .eq('id', existingId);
          if (error) throw error;
          updated += 1;
        } else {
          const studioId = resolveStudioForImport(
            syncStudios ?? [],
            { title: fields.title, location: fields.location },
            feed.default_studio_id,
          );
          toInsert.push({
            user_id: userId,
            source: 'ics',
            external_id: item.uid,
            ics_feed_id: feed.id,
            studio_id: studioId,
            status: studioId ? 'assigned' : 'unassigned',
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
        .from('ics_feeds')
        .update({ last_synced_at: finishedAt })
        .eq('id', feed.id);

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
}
