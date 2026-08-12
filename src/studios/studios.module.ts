import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { StudiosController } from './studios.controller';
import { StudiosService } from './studios.service';

@Module({
  imports: [SupabaseModule, AuthModule, EventsModule],
  controllers: [StudiosController],
  providers: [StudiosService],
})
export class StudiosModule {}
