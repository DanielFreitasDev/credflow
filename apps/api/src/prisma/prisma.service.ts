import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Prisma 7 is Rust-engine-free: the client talks to PostgreSQL through a
      // driver adapter (node-postgres). DATABASE_URL is guaranteed present here —
      // env.validation aborts boot if it's missing — so the cast is safe.
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      // `Customer.documentHash` is an internal, key-bound blind index used only
      // for exact lookup/uniqueness (via `where`) — it must never leave the DB
      // layer. Omitting it globally guarantees no query, including nested
      // `customer` includes, can leak it into an API response.
      omit: { customer: { documentHash: true } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
