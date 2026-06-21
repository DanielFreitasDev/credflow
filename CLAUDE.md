# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

CredFlow is a credit & loan management platform covering the full lifecycle:
customer → proposal → credit analysis → contract → installments → payments → collections/renegotiation.
Code and comments are English; the product domain and UI are pt-BR (Brazil). The README is in Portuguese.

## Repository layout

Two **independent** npm projects under `apps/` — there is **no root `package.json` or workspace tooling**. Always `cd` into the relevant app before running npm scripts.

- `apps/api` — NestJS + Prisma + PostgreSQL backend
- `apps/web` — React + Vite + TailwindCSS frontend
- `docker-compose.yml` — orchestrates `db` + `api` + `web`

## Commands

### Docker (full stack)
```bash
cp .env.example .env
docker compose up --build      # api container auto-runs migrate deploy + seed on start
```
Frontend → http://localhost:5173 · API → http://localhost:3333/api · Swagger → http://localhost:3333/api/docs
Login: `admin@credflow.dev` / `Admin@123456`. Set `DB_PORT` in `.env` if host 5432 is taken.

### Backend (`cd apps/api`)
```bash
npm run start:dev        # watch mode (http://localhost:3333/api)
npm run build            # nest build
npm run typecheck        # tsc --noEmit  (run prisma generate first)
npm run lint             # eslint --fix
npm test                 # unit tests (Jest)
npm run test:e2e         # e2e HTTP pipeline tests (no DB needed)
npm run test:cov         # coverage
npx jest finance         # run a single test file by path fragment
npx jest -t "CET"        # run tests matching a name
npx prisma generate      # regenerate client — REQUIRED before build/typecheck after schema changes
npx prisma migrate dev --name <name>   # create + apply a dev migration
npx prisma migrate deploy              # apply existing migrations (prod/CI)
npm run db:seed          # idempotent seed (tsx prisma/seed.ts)
npm run prisma:studio    # inspect data
```

### Frontend (`cd apps/web`)
```bash
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build
npm run typecheck
npm run lint
```

## Architecture — the parts that span multiple files

### Money is integer **cents** in all business logic (the central invariant)
Floating-point money math is a bug. The conversion boundary is `apps/api/src/domain/finance/money.ts` and nowhere else:
- DB `Decimal(14,2)` → `reaisToCents()` → integer math in `domain/finance` → `centsToDecimal()` back to DB, or `centsToReais()` for API responses.
- **Rates are stored as fractions, not percentages**: `Decimal(9,6)` where `0.025000` = 2.5%/month. Pass `Number(rate)` straight into finance functions.
- Rounding residue is absorbed into the **last installment** so the balance closes to exactly zero — preserve this when touching schedule builders.

### Pure financial domain — `apps/api/src/domain/finance/`
Framework-free, no Prisma/NestJS imports, 100% unit-tested (`.spec.ts` files sit alongside). This is where loan math lives; keep it pure.
- `finance.ts` — Price / SAC / Simple amortization schedules; **CET via IRR (bisection)** equating cash *released* to the payment stream; late charges (one-time fine + daily pro-rata mora = monthlyRate/30 × daysLate).
- `credit-policy.ts` — deterministic, **explainable** rule engine. `evaluateCredit()` returns a decision **plus `reasons[]`** (auditable). `DEFAULT_POLICY` holds thresholds/score bands. Decision propagates to proposal lifecycle in `analysis.service.ts`.
- `money.ts`, `fees.ts` (IOF estimation).

### NestJS conventions (`apps/api/src`)
- Each business module: `modules/<name>/` = `*.controller.ts` + `*.service.ts` + `*.module.ts` + `dto/`. Business logic lives in services; controllers are thin.
- Cross-cutting in `common/`: `audit/`, `crypto/`, `decorators/`, `filters/`, `interceptors/`, `utils/`. Env in `config/`. `prisma/` wraps `PrismaService`.
- **Globals registered in `app.module.ts`** (guard order matters): `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`; plus `AllExceptionsFilter` and `LoggingInterceptor`. The global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) is set in `main.ts` — DTOs must declare every accepted field or requests are rejected.
- `main.ts` enables graceful shutdown hooks and **only mounts Swagger (`/api/docs`) when `NODE_ENV !== 'production'`**. Public health endpoints: `GET /api/health` (liveness) and `GET /api/health/ready` (readiness — pings the DB). `/auth/login` and `/auth/refresh` carry stricter per-route throttling than the global limit.
- Path alias: `src/*` (see `tsconfig.json`).

### Auth & RBAC
- JWT **access + refresh with rotation** (algorithm pinned to **HS256** on sign + verify). Refresh tokens are SHA-256-hashed and persisted (`RefreshToken`); on `refresh` the used token is revoked before a new pair is issued, and **reuse of a revoked token revokes the whole family**. Password change **and admin-forced password reset** revoke all sessions. **Account lockout**: 5 consecutive failed logins lock the account for 15 min (`User.failedLoginCount`/`lockedUntil`). Passwords use **Argon2id** (min 12 chars). Payments accept an optional **`idempotencyKey`** (unique) so a retried submission is a no-op replay, not a double charge.
- Authorization is default-deny via the global `JwtAuthGuard`. Opt out with `@Public()`. Restrict with `@Roles(Role.X, ...)`. **`ADMIN` bypasses all role checks**, and a route with no `@Roles()` is open to any authenticated user.
- Inject the acting user with `@CurrentUser('id') actorId: string` and thread `actorId` through service calls (used for audit + ownership).

### Audit trail
`AuditService.record({ userId, action, entity, entityId, before, after })` writes append-only `AuditLog` rows. It is **best-effort: it never throws** (failures are logged), so it can't break a business flow. Call it after sensitive writes — follow the existing pattern in each service.

### State machines & cross-service flows
Status changes are validated, not free-form. When editing these flows, keep the chained side effects intact:
- Proposals: explicit `TRANSITIONS` map in `proposals.service.ts`; invalid transitions throw. Every change writes a `ProposalEvent`.
- `analysis.service.ts` runs the policy engine and **propagates** the result to proposal status (APPROVED/REJECTED) or leaves it UNDER_REVIEW for manual decision.
- `contracts.service.createFromProposal` generates the installment schedule, moves the proposal to CONTRACTED, and activates the customer.
- `payments.service.register` allocates a payment in waterfall order (**mora interest → fine → installment interest → principal**), then recomputes contract settlement and refreshes the collections/arrears case.
- `collections.service` flags overdue installments, opens/updates/resolves cases, toggles DEFAULTED↔ACTIVE, and renegotiates debt into a brand-new contract. `runDailyCollections()` chains arrears refresh + the **dunning ladder** (`applyDunningLadder`, escalation by days-overdue bucket, idempotent via `CollectionCase.dunningStage`) + **promise reconciliation** (`reconcilePromises`, marks KEPT/BROKEN). A daily cron in `collections.scheduler.ts` (`@nestjs/schedule`; `ScheduleModule.forRoot()` registered in `app.module.ts`) runs it automatically; `POST /collections/run` triggers the same cycle on demand.

### Sequential human-readable numbers
`PRO-2026-000001`, `CTR-2026-000001` via `common/utils/sequence.util.ts`: `buildSequentialNumber()` wrapped in `retryOnUniqueViolation()` (retries Prisma `P2002`) because count-based numbering can race under concurrency.

### PII encryption
`common/crypto/encryption.service.ts` (crypto primitives live in framework-free `common/crypto/pii.util.ts`, shared with `prisma/seed.ts` so encryption never drifts) — AES-256-GCM for sensitive fields at rest. The customer's primary CPF/CNPJ (`Customer.document`) **and** attached `CustomerDocument.number` are stored as ciphertext; uniqueness and exact lookup use a deterministic **HMAC-SHA256 blind index** (`Customer.documentHash`) keyed by a **dedicated key derived from `ENCRYPTION_KEY` via HKDF** (or the explicit `BLIND_INDEX_KEY`) — domain-separated from the AES key and not brute-forceable without it — with `documentLast4` for masked display/audit (never log the full document). Changing the blind-index key/scheme requires re-running `npm run db:backfill-documents` (an idempotent re-indexer). Output is `base64(iv[12] | authTag[16] | ciphertext)`. `safeDecrypt` tolerates legacy plaintext (seed / rows not yet backfilled); services decrypt on read, so the API still returns the real document to authorized users. `ENCRYPTION_KEY` must decode to exactly 32 bytes. After deploying the `protect_customer_document` migration on an existing DB, run `npm run db:backfill-documents` to encrypt legacy rows. Reads present the document **role-aware** via `EncryptionService.presentDocumentField(obj, role)`: operational roles get the real decrypted value, the read-only **AUDITOR** role gets a last-4 mask (never raw PII). Thread the actor role from the controller (`@CurrentUser('role')`) into the list/findOne service methods of customers/proposals/contracts/collections — they all accept an optional `role` param.

### Dates
`common/utils/date.util.ts` — TZ-consistent helpers (local-noon-buffered rather than literally UTC, but internally consistent across due-date and arrears math). `addMonths` uses noon to dodge TZ shifts and handles month overflow; `daysBetween` floors a day diff. Use these for due dates and arrears rather than raw `Date` math.

### Config fail-fast
`config/env.validation.ts` runs at module load and aborts boot if required vars are missing, JWT secrets are < 16 chars, or `ENCRYPTION_KEY` isn't 32 bytes (base64). Typed access via `config/configuration.ts` (e.g. `config.get('jwt.accessSecret')`).

### Frontend
- `lib/api.ts` — single Axios instance. Request interceptor attaches the bearer token; response interceptor does a **single refresh-and-retry on 401** (deduped through a shared `refreshing` promise) and bounces to `/login` on failure. Tokens live in `localStorage`. Auth routes are excluded from the retry.
- Routing in `App.tsx`: `ProtectedRoute` wraps `Layout` wraps the pages.
- Server state via **TanStack Query** — `useQuery`/`useMutation` calls are written **inline per page**, not in a shared hooks file (`lib/hooks.ts` only exports `useDebounce`). Forms via **React Hook Form + Zod**; shared types in `lib/types.ts`.
- **Theming / dark mode**: Tailwind `darkMode: 'class'`. `lib/theme.tsx` (`ThemeProvider`/`useTheme`) toggles the `dark` class on `<html>`, persists to `localStorage` (`credflow.theme`), and falls back to `prefers-color-scheme`. An inline script in `index.html` applies the theme **before paint** (no FOUC) — keep its storage key in sync with `theme.tsx`. New UI must carry `dark:` variants (palette: surfaces `slate-900/950`, text `slate-100→400`, borders `slate-700/800`, soft accents `{color}-500/10`). Recharts renders SVG outside Tailwind, so its colors are themed explicitly via `useTheme()` in `DashboardPage`.
- **Branding**: `components/Logo.tsx` renders the lockup — the brand **symbol** (`public/brand/credflow_symbol_tight.svg`, a tight-cropped viewBox so it reads large at small box sizes) + a live-text "CredFlow" wordmark (`Flow` in the brand gradient `#255EEB→#16C7E6→#30D17A`), no micro-subtitle. Used in the sidebar (`Layout.tsx`, `size="sm"`) and login (`LoginPage.tsx`, `size="lg" onDark`). `onDark` forces a light wordmark on the always-dark login (the theme `dark:` variant can't be relied on there). Favicon `public/favicon.svg`; app icon `public/brand/credflow_app_icon.png` (also the `apple-touch-icon`); full horizontal lockup SVGs also live in `public/brand/`. The `brand-*` Tailwind scale is a blue ramp anchored to **Trust Blue `#255eeb` at `600`** (the brand primary) — use `brand-*` for accents; chart hexes in `DashboardPage` mirror it (`#255eeb`). Source brand kit: `credflow_logo_package/credflow_brand/`.

## Database
- Schema: `apps/api/prisma/schema.prisma` (16 models). Five migrations: `0_init` (base schema), `20260621000000_protect_customer_document` (CPF/CNPJ encryption + blind index), `20260621201957_widen_cet_indexes_protect_payments` (CET widened to `Decimal(12,6)`, payment FKs `RESTRICT`), `20260621211730_harden_indexes_constraints_dunning` (pg_trgm trigram search indexes, `CollectionCase.dunningStage`, PaymentPromise indexes, and range CHECK constraints — the CHECK constraints are appended raw SQL: Prisma doesn't model them, so they live only in migrations and never cause drift), and `20260621230000_harden_lockout_idempotency_indexes` (account-lockout fields on `User`, unique `Payment.idempotencyKey`, `CollectionCase.daysOverdue` + `Customer.internalScore` indexes, dropped redundant `Installment[status]` index, and contract date-ordering + rate-ceiling CHECKs). Money columns are `Decimal(14,2)`, rates `Decimal(9,6)`, CET `Decimal(12,6)`. The `postgresqlExtensions` preview is enabled so Prisma manages the `pg_trgm` extension.
- In Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` then `prisma db seed` automatically before starting. Locally you run these yourself.
- The seed (`prisma/seed.ts`) is idempotent and creates one user per role plus demo customers/proposals/contracts/payments and an overdue collection case.

## Testing notes
- The API Jest config is inline in `apps/api/package.json` (unit `*.spec.ts` under `src/`); e2e config is `apps/api/test/jest-e2e.json`. The current e2e test exercises the simulation HTTP pipeline and needs **no database**.
- The financial domain is the most thoroughly tested area — add/extend `domain/finance/*.spec.ts` when changing loan math.
