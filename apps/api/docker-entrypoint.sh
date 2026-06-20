#!/bin/sh
set -e

echo "⏳ Applying database migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database (idempotent)..."
npx prisma db seed || echo "Seed step skipped/failed (continuing)."

echo "🚀 Starting CredFlow API..."
exec node dist/main.js
