import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { renderToBuffer } from '@react-pdf/renderer';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { InvoicePdf } from './pdf/invoice-pdf';

@Controller('invoices')
@UseGuards(SupabaseAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.invoicesService.list(request.user.id);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.invoicesService.findOne(request.user.id, id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(request.user.id, id, dto);
  }

  @Patch(':id/line-items/:lineItemId')
  updateLineItem(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: UpdateLineItemDto,
  ) {
    return this.invoicesService.updateLineItemRate(
      request.user.id,
      id,
      lineItemId,
      dto.rate,
    );
  }

  @Post(':id/generate')
  generate(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.invoicesService.generate(request.user.id, id);
  }

  @Post(':id/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.invoicesService.archive(request.user.id, id);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.invoicesService.remove(request.user.id, id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { invoice, lineItems } = await this.invoicesService.findOne(
      request.user.id,
      id,
    );

    const metadata = request.user.user_metadata as Record<string, unknown>;
    const buffer = await renderToBuffer(
      InvoicePdf({
        invoice,
        lineItems,
        coach: {
          fullName: (metadata?.full_name as string | undefined) ?? '',
          email: request.user.email ?? '',
          siret: (metadata?.siret as string | undefined) ?? null,
          iban: (metadata?.iban as string | undefined) ?? null,
          bankAccountName:
            (metadata?.bank_account_name as string | undefined) ?? null,
          bankName: (metadata?.bank_name as string | undefined) ?? null,
          bankAddress: (metadata?.bank_address as string | undefined) ?? null,
          bankPhone: (metadata?.bank_phone as string | undefined) ?? null,
        },
        currency:
          metadata?.currency === 'USD' || metadata?.currency === 'GBP'
            ? metadata.currency
            : 'EUR',
      }),
    );

    const filename = `${invoice.invoice_number ?? 'invoice-draft'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
