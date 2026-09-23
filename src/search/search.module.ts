import { AccessModule } from '../access/access.module';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [SupabaseModule, AuthModule, AccessModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
