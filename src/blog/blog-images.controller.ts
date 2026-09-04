import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BlogService } from './blog.service';

// Separate top-level path (not nested under /blog/:slug) so filenames never
// collide with post slugs.
@Controller('blog-images')
export class BlogImagesController {
  constructor(private readonly blogService: BlogService) {}

  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res() res: Response) {
    const { buffer, contentType } = await this.blogService.readImage(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  }
}
