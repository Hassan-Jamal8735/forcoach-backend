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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ImportEventsDto } from './dto/import-events.dto';
import { BulkDeleteEventsDto } from './dto/bulk-delete-events.dto';
import { BulkAssignEventsDto } from './dto/bulk-assign-events.dto';

@Controller('events')
@UseGuards(SupabaseAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.eventsService.findAll(request.user.id);
  }

  @Post('import')
  importCsv(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ImportEventsDto,
  ) {
    return this.eventsService.importCsv(request.user.id, dto);
  }

  @Get('import-activity')
  listImportActivity(@Req() request: AuthenticatedRequest) {
    return this.eventsService.listImportActivity(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateEventDto) {
    return this.eventsService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.eventsService.remove(request.user.id, id);
  }

  @Post('bulk-delete')
  bulkRemove(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BulkDeleteEventsDto,
  ) {
    return this.eventsService.bulkRemove(request.user.id, dto.ids);
  }

  @Post('bulk-assign')
  bulkAssign(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BulkAssignEventsDto,
  ) {
    return this.eventsService.bulkAssignStudio(
      request.user.id,
      dto.ids,
      dto.studioId,
    );
  }
}
