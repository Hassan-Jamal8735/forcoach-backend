import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateStudioDto } from './dto/create-studio.dto';
import { UpdateStudioDto } from './dto/update-studio.dto';
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
    compensation_value: dto.compensationValue,
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
  if (dto.matchKeywords !== undefined) row.match_keywords = dto.matchKeywords;
  if (dto.status !== undefined) row.status = dto.status;
  return row;
}

@Injectable()
export class StudiosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  async create(userId: string, dto: CreateStudioDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('studios')
      .insert(toInsertRow(dto, userId))
      .select()
      .single();

    if (error) throw error;
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
