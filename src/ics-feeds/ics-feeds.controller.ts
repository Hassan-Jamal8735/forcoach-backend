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
import { IcsFeedsService } from './ics-feeds.service';
import { CreateIcsFeedDto } from './dto/create-ics-feed.dto';
import { UpdateIcsFeedDto } from './dto/update-ics-feed.dto';
import { UploadIcsDto } from './dto/upload-ics.dto';

@Controller('ics-feeds')
@UseGuards(SupabaseAuthGuard)
export class IcsFeedsController {
  constructor(private readonly icsFeedsService: IcsFeedsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.icsFeedsService.list(request.user.id);
  }

  @Post('upload')
  upload(@Req() request: AuthenticatedRequest, @Body() dto: UploadIcsDto) {
    return this.icsFeedsService.importUpload(request.user.id, dto);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateIcsFeedDto) {
    return this.icsFeedsService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateIcsFeedDto,
  ) {
    return this.icsFeedsService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.icsFeedsService.remove(request.user.id, id);
  }

  @Post(':id/sync')
  sync(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.icsFeedsService.sync(request.user.id, id);
  }
}
