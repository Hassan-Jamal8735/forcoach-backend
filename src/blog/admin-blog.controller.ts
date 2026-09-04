import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { BlogService } from './blog.service';
import { UpsertBlogPostDto } from './dto/upsert-blog-post.dto';
import { UploadBlogImageDto } from './dto/upload-blog-image.dto';

@Controller('admin/blog')
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list() {
    return this.blogService.adminList();
  }

  @Post()
  create(@Body() dto: UpsertBlogPostDto) {
    return this.blogService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertBlogPostDto) {
    return this.blogService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blogService.remove(id);
  }

  @Post('images')
  uploadImage(@Body() dto: UploadBlogImageDto) {
    return this.blogService.uploadImage(dto);
  }
}
