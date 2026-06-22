#!/bin/sh
set -e

# Call the local binaries directly (prisma, tsx) instead of `npx`, so the
# runtime image needs no global npm/npx (removed in the Dockerfile to drop its
# vulnerable bundled transitive deps). Putting node_modules/.bin on PATH also
# lets `prisma db seed` find `tsx` when it runs the seed command.
export PATH="/app/node_modules/.bin:$PATH"

echo "⏳ Applying database migrations..."
prisma migrate deploy

# Encrypt any legacy plaintext documents left by the protect_customer_document
# migration BEFORE seeding. Idempotent (no-op once every row has a documentHash),
# and required first so the seed's upsert-by-hash matches existing rows instead
# of inserting encrypted duplicates.
echo "🔐 Backfilling encrypted documents (idempotent)..."
tsx prisma/backfill-documents.ts

# Seed runs on boot for dev/demo. With `set -e` a seed failure now aborts the
# boot (instead of silently starting an empty API). In production, separate the
# seed from the API boot by setting RUN_SEED=false.
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "🌱 Seeding database (idempotent)..."
  prisma db seed
else
  echo "⏭️  RUN_SEED=false — skipping seed."
fi

echo "🚀 Starting CredFlow API..."
exec node dist/main.js
