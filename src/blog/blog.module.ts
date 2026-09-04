import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { BlogController } from './blog.controller';
import { AdminBlogController } from './admin-blog.controller';
import { BlogImagesController } from './blog-images.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [BlogController, AdminBlogController, BlogImagesController],
  providers: [BlogService],
})
export class BlogModule {}
