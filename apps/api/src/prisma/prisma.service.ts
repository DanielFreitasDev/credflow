import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from '../generated/prisma/client';

const intEnv = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/**
 * Explicit node-postgres pool config (the pg adapter delegates pooling to it).
 * All values are env-overridable so an operator can size the pool to the DB's
 * `max_connections` / replica count without a code change. SSL defaults ON in
 * production (managed Postgres usually requires TLS); set DB_SSL=false to opt out.
 */
function buildPoolConfig(): PoolConfig {
  const isProd = process.env.NODE_ENV === 'production';
  const useSsl = (process.env.DB_SSL ?? (isProd ? 'true' : 'false')) === 'true';
  return {
    connectionString: process.env.DATABASE_URL as string,
    max: intEnv('DB_POOL_MAX', 10),
    idleTimeoutMillis: intEnv('DB_POOL_IDLE_MS', 30_000),
    connectionTimeoutMillis: intEnv('DB_CONNECT_TIMEOUT_MS', 10_000),
    // Per-connection statement timeout (ms); 0 disables. Bounds a runaway query.
    statement_timeout: intEnv('DB_STATEMENT_TIMEOUT_MS', 30_000),
    ssl: useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Prisma 7 is Rust-engine-free: the client talks to PostgreSQL through a
      // driver adapter (node-postgres). DATABASE_URL is guaranteed present here —
      // env.validation aborts boot if it's missing — so the cast is safe.
      //
      // Pooling/SSL/timeouts are configured EXPLICITLY: the pg adapter does not
      // honour the libpq `?connection_limit=` URL param the old Prisma engine did,
      // so without this the pool silently defaults to max 10 per process (which
      // multiplies across replicas against Postgres `max_connections`), no TLS,
      // and no statement timeout (a pathological query could pin a connection).
      adapter: new PrismaPg(buildPoolConfig()),
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
