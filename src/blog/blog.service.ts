import { randomUUID } from 'node:crypto';
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

const BLOG_IMAGES_BUCKET = 'blog-images';
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

    const path = `${randomUUID()}.${ext}`;
    const { error } = await this.supabaseService
      .getClient()
      .storage.from(BLOG_IMAGES_BUCKET)
      .upload(path, buffer, { contentType: dto.contentType });
    if (error) throw error;

    // SUPABASE_URL is the internal Docker-network address (http://supabase-kong:8000),
    // not reachable from a browser — SUPABASE_DOMAIN is the public one, same
    // pattern as SITE_DOMAIN in the Caddyfile.
    const supabaseDomain = this.config.getOrThrow<string>('SUPABASE_DOMAIN');
    return {
      url: `https://${supabaseDomain}/storage/v1/object/public/${BLOG_IMAGES_BUCKET}/${path}`,
    };
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
