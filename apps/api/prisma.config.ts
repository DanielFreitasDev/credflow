import { defineConfig } from 'prisma/config';

// Prisma 7 configuration. Replaces the schema's `datasource.url` and the
// package.json `prisma.seed` key (both removed/relocated in v7).
//
// The connection URL is read straight from the environment (DATABASE_URL) —
// provided by docker-compose in containers and exported in the shell for local
// runs, the same way the API itself receives it. We read `process.env` directly
// (rather than Prisma's `env()` helper, which throws eagerly at config load when
// the var is absent) so that DB-less commands like `prisma generate` still work
// during the Docker build stage and in CI, where DATABASE_URL isn't set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
