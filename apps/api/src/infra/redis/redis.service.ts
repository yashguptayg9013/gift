import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { env } from '../../config/env';

/** Shared Redis connection (health checks, BullMQ connection options). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  get enabled() {
    return env().JOBS_ENABLED;
  }

  getClient(): Redis | null {
    if (!this.enabled) return null;
    if (!this.client) {
      this.client = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
      this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    }
    return this.client;
  }

  async ping(): Promise<'ok' | 'down' | 'disabled'> {
    const c = this.getClient();
    if (!c) return 'disabled';
    try {
      return (await c.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
