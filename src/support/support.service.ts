import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { MailService } from './mail.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async listMessages(userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  /**
   * Sends a message from the coach and emails the admin, so Aya finds out
   * without having to keep the panel open — same reasoning as the earlier
   * new-signup notification, but this one has a real ongoing purpose.
   */
  async sendUserMessage(userId: string, userEmail: string, body: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('support_messages')
      .insert({ user_id: userId, sender: 'user', body })
      .select()
      .single();
    if (error) throw error;

    const adminEmail = this.config.get<string>(
      'ADMIN_EMAIL',
      'contact@forcoach.io',
    );
    await this.mailService.send(
      adminEmail,
      'New FORCOACH support message',
      `${userEmail} sent a message:\n\n${body}\n\nReply from the admin panel.`,
    );

    return data;
  }

  /** Marks every admin message in this thread as seen by the coach. */
  async markReadByUser(userId: string) {
    const { error } = await this.supabaseService
      .getClient()
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('sender', 'admin')
      .is('read_at', null);
    if (error) throw error;
    return { success: true };
  }
}
