# ---- Build stage (full deps: compile TS + generate Prisma client) ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Production dependencies stage ----
# Installs ONLY production deps (prisma CLI + tsx are runtime deps, used by the
# entrypoint for migrate/backfill/seed). This keeps dev tooling (jest, eslint,
# ts-jest, @nestjs/cli, ...) — and its vulnerable transitive packages — OUT of
# the runtime image. Prisma 7 emits the client into the app source tree
# (src/generated/prisma, copied from the build stage) rather than into
# node_modules, so `npm ci` alone suffices here: it provides the @prisma/client
# runtime + the pg driver adapter, and no `prisma generate` is needed.
FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime stage ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Drop the base image's bundled global npm/npx — unused at runtime (the
# entrypoint calls local binaries) and a source of vulnerable transitive deps
# (glob/minimatch/tar/cross-spawn) that container scanning would otherwise flag.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Slim, production-only node_modules — the @prisma/client runtime + pg driver
# adapter (Prisma 7 has no Rust engine). The generated client itself is no longer
# in node_modules: it ships compiled in dist/ (for `node dist/main.js`) and as
# source in src/generated (for the tsx-run seed/backfill). All artifacts owned by
# the unprivileged `node` user (uid 1000) so the container runs non-root.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
# `prisma db seed` runs prisma/seed.ts via tsx, which imports the pure domain
# modules from src/ (and the generated client from src/generated) — so src must
# be present in the runtime image too.
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/package.json ./package.json
# Prisma 7 reads the datasource URL + seed command from prisma.config.ts, so the
# entrypoint's `prisma migrate deploy` and `prisma db seed` need it at runtime.
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
# Drop privileges: the API process (and migrate/backfill/seed) run as non-root.
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
