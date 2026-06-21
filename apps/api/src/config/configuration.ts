export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  trustProxy: boolean | number | string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  encryptionKey: string;
  /** Optional explicit blind-index key (base64, 32 bytes). Derived from encryptionKey when unset. */
  blindIndexKey?: string;
  /** Optional bearer token guarding GET /api/metrics. Public when unset (dev). */
  metricsToken?: string;
  throttle: {
    ttl: number;
    limit: number;
    redisUrl?: string;
  };
  logFormat: 'json' | 'pretty';
}

/**
 * Express `trust proxy` setting. Accepts a hop count ("1"), a boolean
 * ("true"/"false"), or a named preset ("loopback"). Defaults to off.
 */
function parseTrustProxy(value?: string): boolean | number | string {
  if (value == null || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    port: parseInt(process.env.API_PORT ?? '3333', 10),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET as string,
      refreshSecret: process.env.JWT_REFRESH_SECRET as string,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    encryptionKey: process.env.ENCRYPTION_KEY as string,
    blindIndexKey: process.env.BLIND_INDEX_KEY || undefined,
    metricsToken: process.env.METRICS_TOKEN || undefined,
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
      redisUrl: process.env.THROTTLER_REDIS_URL ?? process.env.REDIS_URL ?? undefined,
    },
    // Structured JSON access logs in production by default (ship to ELK/Datadog);
    // human-readable lines in dev. Override with LOG_FORMAT=json|pretty.
    logFormat:
      (process.env.LOG_FORMAT as 'json' | 'pretty' | undefined) ??
      (nodeEnv === 'production' ? 'json' : 'pretty'),
  };
};
