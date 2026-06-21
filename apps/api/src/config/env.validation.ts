/**
 * Fail-fast validation of required environment variables.
 * Runs at module load so the process never boots half-configured.
 */
const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
];

// Development-only secrets shipped in `.env.example` so the stack boots with a
// single command locally. They are explicitly REJECTED when NODE_ENV=production
// so a deployment can never accidentally run with public, known credentials.
const DEV_PLACEHOLDER_SECRETS = new Set([
  'change_me_access_secret_at_least_32_chars_long_value',
  'change_me_refresh_secret_at_least_32_chars_long_value',
  'Z3vJ8mC2pQ9rS5tU7wX0yA1bD4eF6gH8iK0lM2nO4qQ=',
]);

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key] || `${config[key]}`.trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill them in.`,
    );
  }

  for (const secret of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (`${config[secret]}`.length < 32) {
      throw new Error(`${secret} must be at least 32 characters long.`);
    }
  }

  // ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).
  const keyBytes = Buffer.from(`${config.ENCRYPTION_KEY}`, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes encoded in base64 (run: openssl rand -base64 32).');
  }

  // Production hardening: refuse to boot with example/placeholder secrets or a
  // wildcard CORS origin — these are safe for local dev but catastrophic in prod.
  const nodeEnv = `${config.NODE_ENV ?? process.env.NODE_ENV ?? 'development'}`;
  if (nodeEnv === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
      const value = `${config[key]}`;
      if (DEV_PLACEHOLDER_SECRETS.has(value) || value.includes('change_me')) {
        throw new Error(
          `${key} is a development placeholder; generate a unique secret for production ` +
            `(openssl rand -base64 32 / -hex 48).`,
        );
      }
    }
    const cors = `${config.CORS_ORIGIN ?? ''}`;
    const origins = cors.split(',').map((o) => o.trim()).filter(Boolean);
    if (origins.length === 0 || origins.includes('*')) {
      throw new Error('CORS_ORIGIN must list explicit origin(s) in production (no empty value or "*").');
    }
  }

  return config;
}
