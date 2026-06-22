# ---- Build stage (full deps: compile TS + generate Prisma client) ----
FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Production dependencies stage ----
# Installs ONLY production deps (prisma CLI + tsx are now runtime deps, used by
# the entrypoint for migrate/backfill/seed) and generates the client against
# them. This keeps dev tooling (jest, eslint, ts-jest, @nestjs/cli, ...) — and
# its vulnerable transitive packages — OUT of the runtime image.
FROM node:26-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# ---- Runtime stage ----
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Drop the base image's bundled global npm/npx — unused at runtime (the
# entrypoint calls local binaries) and a source of vulnerable transitive deps
# (glob/minimatch/tar/cross-spawn) that container scanning would otherwise flag.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Slim, production-only node_modules (with the generated Prisma client). All
# artifacts owned by the unprivileged `node` user (uid 1000) so the container
# runs non-root.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
# `prisma db seed` runs prisma/seed.ts via tsx, which imports the pure domain
# modules from src/ — so src must be present in the runtime image too.
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
# Drop privileges: the API process (and migrate/backfill/seed) run as non-root.
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
