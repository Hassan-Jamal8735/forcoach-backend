import { Controller, Get, Param } from '@nestjs/common';
import { BlogService } from './blog.service';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list() {
    return this.blogService.listPublished();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.blogService.findPublishedBySlug(slug);
  }
}
