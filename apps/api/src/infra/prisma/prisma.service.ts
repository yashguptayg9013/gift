import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'] });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run work inside an interactive transaction with sane defaults for ERP
   * workloads (row locks may wait on concurrent postings).
   */
  tx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) {
    return this.$transaction(fn, {
      maxWait: 10_000,
      timeout: opts?.timeout ?? 30_000,
      isolationLevel: opts?.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }
}
