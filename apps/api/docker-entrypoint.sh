#!/bin/sh
set -e

# Call the local binaries directly (prisma, tsx) instead of `npx`, so the
# runtime image needs no global npm/npx (removed in the Dockerfile to drop its
# vulnerable bundled transitive deps). Putting node_modules/.bin on PATH also
# lets `prisma db seed` find `tsx` when it runs the seed command.
export PATH="/app/node_modules/.bin:$PATH"

# Migrations run on boot by default (the app needs an up-to-date schema). For a
# horizontally-scaled rollout, run `migrate deploy` ONCE as a separate one-shot
# job / init-container and set RUN_MIGRATIONS=false on the app replicas so N
# instances don't race the same migration on startup.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "⏳ Applying database migrations..."
  prisma migrate deploy
else
  echo "⏭️  RUN_MIGRATIONS=false — skipping migrations."
fi

# Encrypt any legacy plaintext documents left by the protect_customer_document
# migration BEFORE seeding. Idempotent (no-op once every row has a documentHash),
# and required first so the seed's upsert-by-hash matches existing rows instead
# of inserting encrypted duplicates. Follows RUN_MIGRATIONS unless set explicitly.
if [ "${RUN_BACKFILL:-${RUN_MIGRATIONS:-true}}" = "true" ]; then
  echo "🔐 Backfilling encrypted documents (idempotent)..."
  tsx prisma/backfill-documents.ts
else
  echo "⏭️  RUN_BACKFILL=false — skipping document backfill."
fi

# Seed is OFF by default so a production boot never writes demo data. Dev/demo
# opt in explicitly (the bundled .env sets RUN_SEED=true). With `set -e` a seed
# failure aborts the boot rather than silently starting a half-seeded API.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "🌱 Seeding database (idempotent)..."
  prisma db seed
else
  echo "⏭️  RUN_SEED=false — skipping seed."
fi

echo "🚀 Starting CredFlow API..."
exec node dist/main.js
