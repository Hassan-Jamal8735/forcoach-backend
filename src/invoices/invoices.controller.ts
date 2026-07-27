import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

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
}
