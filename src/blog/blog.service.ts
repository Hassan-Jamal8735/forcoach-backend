import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertBlogPostDto } from './dto/upsert-blog-post.dto';
import type {
  TablesInsert,
  TablesUpdate,
} from '../supabase/types/database.types';

type BlogPostInsert = TablesInsert<'blog_posts'>;
type BlogPostUpdate = TablesUpdate<'blog_posts'>;

@Injectable()
export class BlogService {
  constructor(private readonly supabaseService: SupabaseService) {}

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
