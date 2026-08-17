import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveTierRate, type RateTier } from '../studios/rate-tiers';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

type InvoiceInsert = TablesInsert<'invoices'>;
type InvoiceUpdate = TablesUpdate<'invoices'>;
type LineItemInsert = TablesInsert<'invoice_line_items'>;

const DEFAULT_DUE_DAYS = 30;

function eventHours(startTime: string, endTime: string): number {
  return (
    (new Date(endTime).getTime() - new Date(startTime).getTime()) /
    (1000 * 60 * 60)
  );
}

@Injectable()
export class InvoicesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  private async getInvoice(userId: string, id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Invoice not found');
    return data;
  }

  async findOne(userId: string, id: string) {
    const invoice = await this.getInvoice(userId, id);
    const lineItems = await this.getLineItems(id);
    return { invoice, lineItems };
  }

  private async getLineItems(invoiceId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data;
  }

  async create(userId: string, dto: CreateInvoiceDto) {
    const client = this.supabaseService.getClient();

    const { data: studio, error: studioError } = await client
      .from('studios')
      .select(
        '*, rate_tiers:studio_rate_tiers(min_attendance, max_attendance, rate)',
      )
      .eq('id', dto.studioId)
      .eq('user_id', userId)
      .maybeSingle();
    if (studioError) throw studioError;
    if (!studio) throw new NotFoundException('Studio not found');

    const { data: events, error: eventsError } = await client
      .from('events')
      .select(
        'id, title, start_time, end_time, rate_override, attendance_count',
      )
      .eq('user_id', userId)
      .eq('studio_id', dto.studioId)
      .eq('status', 'assigned')
      .gte('start_time', dto.periodStart)
      .lte('start_time', dto.periodEnd)
      .order('start_time', { ascending: true });
    if (eventsError) throw eventsError;

    if (events.length === 0) {
      throw new BadRequestException(
        'No assigned classes for this studio in the selected period.',
      );
    }

    // Tiered classes with no attendance entered (or none of the studio's
    // brackets cover the count) can't be priced — never guess a rate, ask
    // the coach to fill it in first instead.
    if (studio.compensation_type === 'tiered') {
      const tiers = (studio.rate_tiers ?? []) as RateTier[];
      const unpriced = events.filter(
        (event) =>
          event.rate_override == null &&
          resolveTierRate(tiers, event.attendance_count) == null,
      );
      if (unpriced.length > 0) {
        throw new BadRequestException(
          `${unpriced.length} class${unpriced.length === 1 ? '' : 'es'} in this period ` +
            `still need${unpriced.length === 1 ? 's' : ''} an attendance count before invoicing.`,
        );
      }
    }

    const lineItemRows = events.map((event) => {
      const hours = eventHours(event.start_time, event.end_time);
      // Per-class override wins over the studio's default rate. Snapshotted
      // here like everything else, so later rate changes don't rewrite history.
      // The unpriced check above already guarantees this resolves to a real
      // number for tiered studios, so the null case can't reach here.
      const rate: number =
        event.rate_override ??
        (studio.compensation_type === 'tiered'
          ? (resolveTierRate(
              studio.rate_tiers ?? [],
              event.attendance_count,
            ) as number)
          : studio.compensation_value);
      const amount =
        studio.compensation_type === 'hourly' ? hours * rate : rate;
      return {
        title: event.title,
        event_date: event.start_time,
        event_id: event.id,
        hours,
        rate,
        compensation_type: studio.compensation_type,
        amount,
        attendance_count: event.attendance_count,
      };
    });

    const subtotal = lineItemRows.reduce((sum, r) => sum + r.amount, 0);
    const vatRate = dto.vatRate ?? null;
    const vatAmount = vatRate ? (subtotal * vatRate) / 100 : 0;
    const total = subtotal + vatAmount;

    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : new Date(
          new Date(dto.periodEnd).getTime() +
            DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000,
        );

    const invoiceInsert: InvoiceInsert = {
      user_id: userId,
      studio_id: studio.id,
      studio_name: studio.name,
      period_start: dto.periodStart,
      period_end: dto.periodEnd,
      due_date: dueDate.toISOString(),
      status: 'draft',
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
    };

    const { data: invoice, error: invoiceError } = await client
      .from('invoices')
      .insert(invoiceInsert)
      .select()
      .single();
    if (invoiceError) throw invoiceError;

    const lineItemInserts: LineItemInsert[] = lineItemRows.map((row) => ({
      ...row,
      invoice_id: invoice.id,
      user_id: userId,
    }));
    const { data: lineItems, error: lineItemsError } = await client
      .from('invoice_line_items')
      .insert(lineItemInserts)
      .select();
    if (lineItemsError) throw lineItemsError;

    return { invoice, lineItems };
  }

  async update(userId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.getInvoice(userId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(
        'Only draft invoices can be edited. Generated invoices are immutable.',
      );
    }

    const update: InvoiceUpdate = {};
    if (dto.dueDate !== undefined) update.due_date = dto.dueDate;
    if (dto.notes !== undefined) update.notes = dto.notes;
    if (dto.vatRate !== undefined) {
      const vatAmount = dto.vatRate
        ? (invoice.subtotal * dto.vatRate) / 100
        : 0;
      update.vat_rate = dto.vatRate;
      update.vat_amount = vatAmount;
      update.total = invoice.subtotal + vatAmount;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Changes the rate on one line of a draft invoice and recalculates the
   * invoice totals.
   *
   * Draft only. Once an invoice is generated it has a permanent number and has
   * likely been sent, so it must stay exactly as issued.
   */
  async updateLineItemRate(
    userId: string,
    invoiceId: string,
    lineItemId: string,
    rate: number,
  ) {
    const invoice = await this.getInvoice(userId, invoiceId);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(
        'Only draft invoices can be edited. Generated invoices are immutable.',
      );
    }

    const client = this.supabaseService.getClient();

    const { data: item, error: itemError } = await client
      .from('invoice_line_items')
      .select('*')
      .eq('id', lineItemId)
      .eq('invoice_id', invoiceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new NotFoundException('Invoice line not found');

    const amount =
      item.compensation_type === 'hourly' ? item.hours * rate : rate;

    const { error: updateError } = await client
      .from('invoice_line_items')
      .update({ rate, amount })
      .eq('id', lineItemId);
    if (updateError) throw updateError;

    // Recompute from the stored lines rather than adjusting by a delta, so the
    // totals can't drift out of step with the rows they're meant to summarise.
    const lineItems = await this.getLineItems(invoiceId);
    const subtotal = lineItems.reduce((sum, l) => sum + l.amount, 0);
    const vatAmount = invoice.vat_rate
      ? (subtotal * invoice.vat_rate) / 100
      : 0;

    const { data: updated, error: invoiceError } = await client
      .from('invoices')
      .update({ subtotal, vat_amount: vatAmount, total: subtotal + vatAmount })
      .eq('id', invoiceId)
      .select()
      .single();
    if (invoiceError) throw invoiceError;

    return { invoice: updated, lineItems: await this.getLineItems(invoiceId) };
  }

  async generate(userId: string, id: string) {
    const invoice = await this.getInvoice(userId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be generated.');
    }

    const client = this.supabaseService.getClient();
    const year = new Date().getFullYear();
    const prefix = `FC-${year}-`;

    const { data: existing, error: existingError } = await client
      .from('invoices')
      .select('invoice_number')
      .eq('user_id', userId)
      .not('invoice_number', 'is', null)
      .ilike('invoice_number', `${prefix}%`);
    if (existingError) throw existingError;

    const maxSeq = (existing ?? []).reduce((max, row) => {
      const seq = parseInt(row.invoice_number.slice(prefix.length), 10);
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
    const invoiceNumber = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;

    const update: InvoiceUpdate = {
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString(),
      status: 'generated',
    };

    const { data, error } = await client
      .from('invoices')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async archive(userId: string, id: string) {
    const invoice = await this.getInvoice(userId, id);
    if (invoice.status !== 'generated') {
      throw new BadRequestException('Only generated invoices can be archived.');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .update({ status: 'archived' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(userId: string, id: string) {
    const invoice = await this.getInvoice(userId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(
        'Only draft invoices can be deleted. Generated invoices are kept as a permanent record.',
      );
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('invoices')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  }
}
