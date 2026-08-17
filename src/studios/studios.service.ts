import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventsService } from '../events/events.service';
import { CreateStudioDto } from './dto/create-studio.dto';
import { UpdateStudioDto } from './dto/update-studio.dto';
import { CreateFromSuggestionsDto } from './dto/create-from-suggestions.dto';
import {
  buildStudioSuggestions,
  type StudioSuggestion,
} from './studio-suggestions';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

type StudioInsert = TablesInsert<'studios'>;
type StudioUpdate = TablesUpdate<'studios'>;

function toInsertRow(dto: CreateStudioDto, userId: string): StudioInsert {
  return {
    user_id: userId,
    name: dto.name,
    reference_id: dto.referenceId,
    contact_person: dto.contactPerson,
    email: dto.email,
    phone: dto.phone,
    address: dto.address,
    notes: dto.notes,
    compensation_type: dto.compensationType,
    // Tiered studios don't use a single flat value; the rate lives in
    // rateTiers instead, so this column is unused but still not-null.
    compensation_value: dto.compensationValue ?? 0,
    status: dto.status ?? 'active',
    match_keywords: dto.matchKeywords ?? [],
  };
}

function toUpdateRow(dto: UpdateStudioDto): StudioUpdate {
  const row: StudioUpdate = {};
  if (dto.name !== undefined) row.name = dto.name;
  if (dto.referenceId !== undefined) row.reference_id = dto.referenceId;
  if (dto.contactPerson !== undefined) row.contact_person = dto.contactPerson;
  if (dto.email !== undefined) row.email = dto.email;
  if (dto.phone !== undefined) row.phone = dto.phone;
  if (dto.address !== undefined) row.address = dto.address;
  if (dto.notes !== undefined) row.notes = dto.notes;
  if (dto.compensationType !== undefined)
    row.compensation_type = dto.compensationType;
  if (dto.compensationValue !== undefined)
    row.compensation_value = dto.compensationValue;
  else if (dto.compensationType === 'tiered') row.compensation_value = 0;
  if (dto.matchKeywords !== undefined) row.match_keywords = dto.matchKeywords;
  if (dto.status !== undefined) row.status = dto.status;
  return row;
}

@Injectable()
export class StudiosService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventsService: EventsService,
  ) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .select('*, rate_tiers:studio_rate_tiers(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Replaces a studio's whole tier list rather than editing rows in place —
   * simplest way to keep it in sync with whatever the coach has in the form,
   * and mirrors how invoice totals are recomputed from scratch elsewhere.
   */
  private async replaceRateTiers(
    userId: string,
    studioId: string,
    tiers: { minAttendance: number; maxAttendance?: number; rate: number }[],
  ) {
    const client = this.supabaseService.getClient();

    const { error: deleteError } = await client
      .from('studio_rate_tiers')
      .delete()
      .eq('studio_id', studioId)
      .eq('user_id', userId);
    if (deleteError) throw deleteError;

    if (tiers.length === 0) return;

    const rows = tiers.map((t) => ({
      user_id: userId,
      studio_id: studioId,
      min_attendance: t.minAttendance,
      max_attendance: t.maxAttendance ?? null,
      rate: t.rate,
    }));
    const { error: insertError } = await client
      .from('studio_rate_tiers')
      .insert(rows);
    if (insertError) throw insertError;
  }

  /**
   * Studios we can infer from the coach's imported classes, so setup can start
   * from "here's what we found" rather than a blank form.
   *
   * Only considers classes that aren't already assigned and aren't already
   * covered by an existing studio, so this empties out once setup is done.
   */
  async getSuggestions(userId: string): Promise<StudioSuggestion[]> {
    const client = this.supabaseService.getClient();

    const [
      { data: studios, error: studiosError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      client
        .from('studios')
        .select('id, name, match_keywords')
        .eq('user_id', userId),
      client
        .from('events')
        .select('title, location')
        .eq('user_id', userId)
        .eq('status', 'unassigned'),
    ]);
    if (studiosError) throw studiosError;
    if (eventsError) throw eventsError;

    return buildStudioSuggestions(events ?? [], studios ?? []);
  }

  /**
   * Creates the studios the coach confirmed, seeding each one's keywords from
   * the text it was detected by, then immediately runs matching so their
   * classes attach without a second step.
   */
  async createFromSuggestions(userId: string, dto: CreateFromSuggestionsDto) {
    const client = this.supabaseService.getClient();

    const rows: StudioInsert[] = dto.studios.map((s) => ({
      user_id: userId,
      name: s.name,
      compensation_type: s.compensationType,
      compensation_value: s.compensationValue,
      status: 'active',
      // Only store a keyword when it differs from the name; the name is always
      // matched anyway, so storing a duplicate would just be noise.
      match_keywords:
        s.keyword && s.keyword.trim() && s.keyword.trim() !== s.name.trim()
          ? [s.keyword.trim()]
          : [],
    }));

    const { data: created, error } = await client
      .from('studios')
      .insert(rows)
      .select();
    if (error) throw error;

    const { matched, stillUnassigned } =
      await this.eventsService.rematchUnassigned(userId);

    return {
      created: created.length,
      studios: created,
      matched,
      stillUnassigned,
    };
  }

  async create(userId: string, dto: CreateStudioDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .insert(toInsertRow(dto, userId))
      .select()
      .single();

    if (error) throw error;

    if (dto.compensationType === 'tiered') {
      await this.replaceRateTiers(userId, data.id, dto.rateTiers ?? []);
    }
    return data;
  }

  async update(userId: string, id: string, dto: UpdateStudioDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .update(toUpdateRow(dto))
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Studio not found');

    if (dto.rateTiers !== undefined) {
      await this.replaceRateTiers(userId, id, dto.rateTiers);
    }
    return data;
  }

  async remove(userId: string, id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Studio not found');
    return { success: true };
  }
}
