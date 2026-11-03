import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * SMTP mail adapter. When SMTP_HOST is not configured, messages are logged
 * (development) instead of sent — see DEPLOYMENT_GUIDE.md "Email".
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  get configured() {
    return Boolean(env().SMTP_HOST && env().SMTP_FROM);
  }

  private getTransport() {
    if (!this.transporter) {
      const e = env();
      this.transporter = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_PORT === 465,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      });
    }
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<{ delivered: boolean }> {
    if (!this.configured) {
      if (env().NODE_ENV !== 'production') {
        this.logger.warn(`[mail:not-configured] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
      } else {
        this.logger.warn(`[mail:not-configured] dropped message to=${msg.to} subject="${msg.subject}"`);
      }
      return { delivered: false };
    }
    await this.getTransport().sendMail({ from: env().SMTP_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return { delivered: true };
  }
}
