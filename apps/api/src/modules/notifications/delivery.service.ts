import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../../config/env';
import { MailService } from '../../infra/mail/mail.service';
import { RedisService } from '../../infra/redis/redis.service';

export interface DeliveryJob {
  channel: 'email' | 'whatsapp';
  to: string;
  subject: string;
  text: string;
}

export const DELIVERY_QUEUE = 'puja-delivery';

/**
 * External notification channels. With JOBS_ENABLED the message is queued in
 * BullMQ (retries with backoff); otherwise it is delivered inline.
 */
@Injectable()
export class DeliveryService implements OnModuleDestroy {
  private readonly logger = new Logger(DeliveryService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {}

  get emailConfigured() {
    return this.mail.configured;
  }

  get whatsappConfigured() {
    const e = env();
    return Boolean(e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_ACCESS_TOKEN);
  }

  private getQueue() {
    if (!this.queue && this.redis.enabled) {
      this.queue = new Queue(DELIVERY_QUEUE, { connection: this.redis.getClient()!, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
    }
    return this.queue;
  }

  async enqueue(job: DeliveryJob) {
    if (job.channel === 'email' && !this.emailConfigured) return;
    if (job.channel === 'whatsapp' && !this.whatsappConfigured) return;
    const q = this.getQueue();
    if (q) await q.add('deliver', job);
    else await this.deliver(job).catch((err) => this.logger.warn(`inline delivery failed: ${err instanceof Error ? err.message : err}`));
  }

  async deliver(job: DeliveryJob) {
    if (job.channel === 'email') {
      await this.mail.send({ to: job.to, subject: `[PUJA OS] ${job.subject}`, text: job.text });
      return;
    }
    await this.sendWhatsApp(job.to, job.subject, job.text);
  }

  /**
   * WhatsApp Cloud API. Business-initiated messages require an approved template;
   * WHATSAPP_TEMPLATE_NAME must have one body parameter. Without a template a plain
   * text message is sent (only works inside a 24-hour customer-service window).
   */
  private async sendWhatsApp(to: string, subject: string, text: string) {
    const e = env();
    const phone = to.replace(/[^\d]/g, '');
    const body = e.WHATSAPP_TEMPLATE_NAME
      ? { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: e.WHATSAPP_TEMPLATE_NAME, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: `${subject}: ${text}`.slice(0, 1000) }] }] } }
      : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: `${subject}\n${text}`.slice(0, 4000) } };
    const res = await fetch(`${e.WHATSAPP_API_URL}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  async onModuleDestroy() {
    await this.queue?.close().catch(() => undefined);
  }
}
