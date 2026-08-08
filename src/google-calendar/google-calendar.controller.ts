import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';
import { SelectCalendarDto } from './dto/select-calendar.dto';
import { SetDefaultStudioDto } from './dto/set-default-studio.dto';

@Controller('calendar/google')
@UseGuards(SupabaseAuthGuard)
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  @Get('status')
  status(@Req() request: AuthenticatedRequest) {
    return this.googleCalendarService.getStatus(request.user.id);
  }

  @Get('calendars')
  listCalendars(@Req() request: AuthenticatedRequest) {
    return this.googleCalendarService.listCalendars(request.user.id);
  }

  @Post('select-calendar')
  selectCalendar(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SelectCalendarDto,
  ) {
    return this.googleCalendarService.selectCalendar(request.user.id, dto);
  }

  @Post('default-studio')
  setDefaultStudio(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SetDefaultStudioDto,
  ) {
    return this.googleCalendarService.setDefaultStudio(
      request.user.id,
      dto.studioId,
    );
  }

  @Post('sync')
  sync(@Req() request: AuthenticatedRequest) {
    return this.googleCalendarService.sync(request.user.id);
  }

  @Delete('disconnect')
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.googleCalendarService.disconnect(request.user.id);
  }
}
