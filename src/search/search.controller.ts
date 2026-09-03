import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedRequest } from '../auth/supabase-auth.guard';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(SupabaseAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Req() request: AuthenticatedRequest, @Query('q') q: string) {
    return this.searchService.search(request.user.id, q ?? '');
  }
}
