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

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key] || `${config[key]}`.trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill them in.`,
    );
  }

  for (const secret of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (`${config[secret]}`.length < 16) {
      throw new Error(`${secret} must be at least 16 characters long.`);
    }
  }

  // ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).
  const keyBytes = Buffer.from(`${config.ENCRYPTION_KEY}`, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes encoded in base64 (run: openssl rand -base64 32).');
  }

  return config;
}
