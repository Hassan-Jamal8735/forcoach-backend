import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT', 587),
      secure: this.config.get<string>('MAIL_ENCRYPTION') === 'ssl',
      auth: {
        user: this.config.getOrThrow<string>('MAIL_USERNAME'),
        pass: this.config.getOrThrow<string>('MAIL_PASSWORD'),
      },
    });
    this.fromAddress = this.config.getOrThrow<string>('MAIL_FROM_ADDRESS');
    this.fromName = this.config.get<string>('MAIL_FROM_NAME', 'FORCOACH');
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        subject,
        text,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${to}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
