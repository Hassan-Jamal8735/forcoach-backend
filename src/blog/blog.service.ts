import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertBlogPostDto } from './dto/upsert-blog-post.dto';
import { UploadBlogImageDto } from './dto/upload-blog-image.dto';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

type BlogPostInsert = TablesInsert<'blog_posts'>;
type BlogPostUpdate = TablesUpdate<'blog_posts'>;

// Mounted as a persistent Docker volume in production (see
// docker-compose.app.yml) so uploads survive container rebuilds — images
// live on the VPS itself, not an external host or a storage service this
// self-hosted Supabase stack doesn't run.
const UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'blog');

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class BlogService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async uploadImage(dto: UploadBlogImageDto): Promise<{ url: string }> {
    const ext = EXT_BY_CONTENT_TYPE[dto.contentType];
    if (!ext) throw new BadRequestException('Unsupported image type');

    const buffer = Buffer.from(dto.dataBase64, 'base64');
    // 8MB cap — plenty for a blog article image, small enough to keep
    // uploads and page loads fast.
    if (buffer.byteLength > 8 * 1024 * 1024) {
      throw new BadRequestException('Image must be under 8MB');
    }

    const filename = `${randomUUID()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    const apiDomain = this.config.getOrThrow<string>('API_DOMAIN');
    return { url: `https://${apiDomain}/blog-images/${filename}` };
  }

  async readImage(
    filename: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    // Filenames are always our own randomUUID().ext — reject anything else
    // outright rather than touching the filesystem with untrusted input.
    if (!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(filename)) {
      throw new NotFoundException('Not found');
    }
    const ext = filename.split('.').pop()!;
    const contentType =
      Object.entries(EXT_BY_CONTENT_TYPE).find(([, e]) => e === ext)?.[0] ??
      'application/octet-stream';
    try {
      const buffer = await readFile(join(UPLOAD_DIR, filename));
      return { buffer, contentType };
    } catch {
      throw new NotFoundException('Not found');
    }
  }

  async listPublished() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .select('*')
      .eq('published', true)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findPublishedBySlug(slug: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Post not found');
    return data;
  }

  async adminList() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async adminFindOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Post not found');
    return data;
  }

  async create(dto: UpsertBlogPostDto) {
    const row: BlogPostInsert = {
      title: dto.title,
      slug: dto.slug,
      excerpt: dto.excerpt ?? '',
      content: dto.content ?? '',
      cover_image_url: dto.coverImageUrl ?? null,
      published: dto.published ?? false,
      published_at: dto.published ? new Date().toISOString() : null,
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpsertBlogPostDto) {
    const existing = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .select('published, published_at')
      .eq('id', id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new NotFoundException('Post not found');

    const nowPublishing = dto.published && !existing.data.published;

    const row: BlogPostUpdate = {
      title: dto.title,
      slug: dto.slug,
      excerpt: dto.excerpt ?? '',
      content: dto.content ?? '',
      cover_image_url: dto.coverImageUrl ?? null,
      published: dto.published ?? false,
      // Set once, the first time a post goes live, so re-editing an already
      // published post doesn't bump it back to the top of the list.
      published_at: nowPublishing
        ? new Date().toISOString()
        : dto.published
          ? existing.data.published_at
          : null,
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .update(row)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Post not found');
    return data;
  }

  async remove(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('blog_posts')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Post not found');
    return { success: true };
  }
}
