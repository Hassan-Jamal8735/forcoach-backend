import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ImportEventsDto } from './dto/import-events.dto';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

type EventInsert = TablesInsert<'events'>;
type EventUpdate = TablesUpdate<'events'>;
type ImportActivityInsert = TablesInsert<'import_activity'>;
type ImportActivityUpdate = TablesUpdate<'import_activity'>;

function dedupeKey(row: { title: string; startTime: string; endTime: string }) {
  return `${row.title.trim().toLowerCase()}|${new Date(row.startTime).toISOString()}|${new Date(row.endTime).toISOString()}`;
}

/**
 * status is derived from studio_id (assigned/unassigned) rather than trusted
 * verbatim from the caller, so a studio_id can never be set on an event
 * without it actually counting toward earnings. "excluded" is the one
 * explicit override callers can still request (e.g. the exclude toggle),
 * since it's a deliberate choice independent of studio assignment.
 */
function deriveStatus(
  studioId: string | null | undefined,
  requestedStatus: string | undefined,
): 'assigned' | 'unassigned' | 'excluded' {
  if (requestedStatus === 'excluded') return 'excluded';
  return studioId ? 'assigned' : 'unassigned';
}

function toInsertRow(dto: CreateEventDto, userId: string): EventInsert {
  return {
    user_id: userId,
    title: dto.title,
    description: dto.description,
    location: dto.location,
    start_time: dto.startTime,
    end_time: dto.endTime,
    source: dto.source ?? 'manual',
    studio_id: dto.studioId ?? null,
    status: deriveStatus(dto.studioId, dto.status),
    external_id: dto.externalId,
    notes: dto.notes,
  };
}

function toUpdateRow(
  dto: UpdateEventDto,
  existingStudioId: string | null,
): EventUpdate {
  const row: EventUpdate = {};
  if (dto.title !== undefined) row.title = dto.title;
  if (dto.description !== undefined) row.description = dto.description;
  if (dto.location !== undefined) row.location = dto.location;
  if (dto.startTime !== undefined) row.start_time = dto.startTime;
  if (dto.endTime !== undefined) row.end_time = dto.endTime;
  if (dto.source !== undefined) row.source = dto.source;
  if (dto.studioId !== undefined) row.studio_id = dto.studioId ?? null;
  if (dto.externalId !== undefined) row.external_id = dto.externalId;
  if (dto.notes !== undefined) row.notes = dto.notes;

  if (dto.studioId !== undefined || dto.status !== undefined) {
    const effectiveStudioId =
      dto.studioId !== undefined ? dto.studioId : existingStudioId;
    row.status = deriveStatus(effectiveStudioId, dto.status);
  }
  return row;
}

@Injectable()
export class EventsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data;
  }

  async create(userId: string, dto: CreateEventDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .insert(toInsertRow(dto, userId))
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    const client = this.supabaseService.getClient();

    const { data: existing, error: existingError } = await client
      .from('events')
      .select('studio_id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new NotFoundException('Event not found');

    const { data, error } = await client
      .from('events')
      .update(toUpdateRow(dto, existing.studio_id))
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Event not found');
    return data;
  }

  async remove(userId: string, id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Event not found');
    return { success: true };
  }

  async bulkRemove(userId: string, ids: string[]) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('events')
      .delete()
      .in('id', ids)
      .eq('user_id', userId)
      .select('id');

    if (error) throw error;
    return { success: true, deleted: data.length };
  }

  async importCsv(userId: string, dto: ImportEventsDto) {
    const client = this.supabaseService.getClient();

    const activityInsert: ImportActivityInsert = {
      user_id: userId,
      source: dto.source,
      status: 'running',
      records_processed: dto.rows.length,
    };
    const { data: activity, error: activityError } = await client
      .from('import_activity')
      .insert(activityInsert)
      .select()
      .single();
    if (activityError) throw activityError;

    const startTimes = dto.rows.map((row) => new Date(row.startTime).getTime());
    const minStart = new Date(Math.min(...startTimes)).toISOString();
    const maxStart = new Date(Math.max(...startTimes)).toISOString();

    const { data: existing, error: existingError } = await client
      .from('events')
      .select('title, start_time, end_time')
      .eq('user_id', userId)
      .eq('source', dto.source)
      .gte('start_time', minStart)
      .lte('start_time', maxStart);
    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existing ?? []).map((row) =>
        dedupeKey({
          title: row.title,
          startTime: row.start_time,
          endTime: row.end_time,
        }),
      ),
    );

    const seen = new Set<string>();
    const toInsert: EventInsert[] = [];
    let skipped = 0;

    for (const row of dto.rows) {
      const key = dedupeKey(row);
      if (existingKeys.has(key) || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      toInsert.push({
        user_id: userId,
        title: row.title,
        start_time: row.startTime,
        end_time: row.endTime,
        studio_id: row.studioId,
        notes: row.notes,
        source: dto.source,
        status: row.studioId ? 'assigned' : 'unassigned',
      });
    }

    let created: EventInsert[] = [];
    if (toInsert.length > 0) {
      const { data, error } = await client
        .from('events')
        .insert(toInsert)
        .select();
      if (error) {
        const failureUpdate: ImportActivityUpdate = {
          status: 'failed',
          error_message: error.message,
          finished_at: new Date().toISOString(),
          records_created: 0,
          records_skipped: skipped,
        };
        await client
          .from('import_activity')
          .update(failureUpdate)
          .eq('id', activity.id);
        throw error;
      }
      created = data ?? [];
    }

    const finalUpdate: ImportActivityUpdate = {
      status: 'success',
      records_created: created.length,
      records_updated: 0,
      records_skipped: skipped,
      finished_at: new Date().toISOString(),
    };
    const { data: finishedActivity, error: finishError } = await client
      .from('import_activity')
      .update(finalUpdate)
      .eq('id', activity.id)
      .select()
      .single();
    if (finishError) throw finishError;

    return {
      activity: finishedActivity,
      created: created.length,
      skipped,
    };
  }

  async listImportActivity(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('import_activity')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  }
}
