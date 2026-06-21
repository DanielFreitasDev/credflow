<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/credflow_lockup_dark.svg">
  <img alt="CredFlow" src="apps/web/public/brand/credflow_lockup_light.svg" width="340">
</picture>

**Plataforma de Gestão de Crédito e Empréstimos**

Sistema completo, modular e pronto para produção para empresas que oferecem crédito, financiamento ou empréstimos. Cobre todo o ciclo de vida: **cliente → proposta → análise de crédito → contrato → parcelas → pagamentos → cobrança/renegociação**, com dashboard, RBAC, auditoria e um motor financeiro testado.

</div>

> **TL;DR** — com Docker: `cp .env.example .env && docker compose up --build`. Acesse `http://localhost:5173` e entre com `admin@credflow.dev` / `Admin@123456`.

---

## 📋 Sumário

- [✨ Funcionalidades](#-funcionalidades)
- [🧰 Stack e justificativa](#-stack-e-justificativa)
- [🧱 Arquitetura](#-arquitetura)
- [📁 Estrutura do projeto](#-estrutura-do-projeto)
- [🐳 Como rodar (Docker)](#-como-rodar-com-docker--recomendado)
- [💻 Como rodar (local, sem Docker)](#-como-rodar-localmente-sem-docker)
- [🔧 Variáveis de ambiente](#-variáveis-de-ambiente)
- [💾 Banco de dados, migrations e seed](#-banco-de-dados-migrations-e-seed)
- [🧪 Testes](#-testes)
- [📚 API e documentação (Swagger)](#-api-e-documentação-swagger)
- [🔐 Perfis e permissões (RBAC)](#-perfis-e-permissões-rbac)
- [💰 Motor financeiro](#-motor-financeiro)
- [🔒 Segurança (OWASP)](#-segurança-owasp)
- [🌱 Dados de demonstração](#-dados-de-demonstração)
- [🚀 Guia de deploy](#-guia-de-deploy)
- [🩺 Solução de problemas](#-solução-de-problemas)

---

## ✨ Funcionalidades

| Módulo | Destaques |
|---|---|
| **Clientes** | PF e PJ, validação real de CPF/CNPJ (mod-11), endereço, contatos, documentos, score interno, status, histórico financeiro agregado, auditoria de alterações. |
| **Propostas** | Simulação de empréstimo (Price / SAC / Juros simples), cálculo de parcelas, IOF, TAC, **CET (mensal e anual via IRR)**, máquina de estados (rascunho → análise → aprovada/recusada → contratada → cancelada) com histórico de eventos. |
| **Análise de crédito** | Motor de regras **configurável e explicável**, score, faixa de risco (A–E), limite sugerido, comprometimento de renda, decisão automática **e** manual, registro auditável dos motivos. |
| **Contratos** | Geração a partir de proposta aprovada, número único, cronograma de parcelas, encargos de mora configuráveis, status (ativo, quitado, inadimplente, cancelado, renegociado). |
| **Parcelas e pagamentos** | Geração automática, pagamento parcial e em atraso, **multa + juros de mora pró-rata**, alocação em cascata (mora → multa → juros → principal), baixa e quitação, conciliação básica. |
| **Cobrança** | Régua automática (marca vencidos, abre/fecha casos), dias em atraso, interações, promessas de pagamento, **renegociação de dívida** (consolida saldo em novo contrato). |
| **Dashboard** | Carteira, total emprestado/recebido/em atraso, taxa de inadimplência, propostas/contratos por status, clientes por risco, fluxo de recebimentos futuros (6 meses). |
| **Segurança** | JWT (access + refresh com rotação), Argon2id, RBAC por papéis, Helmet, rate limiting, validação forte, **criptografia AES-256-GCM** de PII sensível, trilha de auditoria. |

---

## 🧰 Stack e justificativa

| Camada | Tecnologia | Por quê |
|---|---|---|
| **Backend** | NestJS + TypeScript | DI nativa, modularidade e guards/pipes que se encaixam em Clean Architecture e RBAC. |
| **Banco** | PostgreSQL 16 | ACID e `NUMERIC` exato — essencial para valores financeiros. |
| **ORM** | Prisma | Type-safety e migrations versionadas, encapsulado em serviços. |
| **Frontend** | React + Vite + TypeScript + TailwindCSS | Padrão de mercado para SaaS, build rápido, UI responsiva. |
| **Dados (front)** | TanStack Query + Axios | Cache de servidor, refetch e estados de loading/erro consistentes. |
| **Forms** | React Hook Form + Zod | Validação forte também no cliente. |
| **Auth** | JWT + Argon2id + Passport | Tokens com rotação/revogação e hashing forte. |
| **Testes** | Jest (unit + e2e) | Cobertura do núcleo financeiro e do pipeline HTTP. |

**Dinheiro:** todo o cálculo é feito em **centavos inteiros** (sem ponto flutuante); o banco persiste `Decimal(14,2)` e as taxas `Decimal(9,6)` (fração, ex.: `0.025000` = 2,5%/mês).

---

## 🧱 Arquitetura

Clean Architecture / camadas, com o domínio financeiro **puro** (sem framework) e testável isoladamente:

```
┌─────────────────────────────────────────────────────────────┐
│ Interface        Controllers REST · Guards · Filtros · DTOs │  (NestJS / React)
├─────────────────────────────────────────────────────────────┤
│ Aplicação        Services (casos de uso) · orquestração     │
├─────────────────────────────────────────────────────────────┤
│ Domínio          finance/ (Price·SAC·Simples, CET/IRR,      │  ← puro, 100% testado
│                  mora) · credit-policy (motor de regras)    │
├─────────────────────────────────────────────────────────────┤
│ Infraestrutura   Prisma · JWT · Argon2 · AES-GCM · Auditoria│
└─────────────────────────────────────────────────────────────┘
```

**Fluxo de negócio:**

```
Cliente ──► Proposta (simulação) ──► Análise (motor de regras) ──► Contrato
                                                                      │
                       Cobrança/Renegociação ◄── Parcelas ◄── Pagamentos
```

Cada entidade tem **máquina de estados explícita** e operações sensíveis geram **registro de auditoria** (`AuditLog`, append-only).

---

## 📁 Estrutura do projeto

```
credflow/
├── docker-compose.yml          # db + api + web
├── .env.example                # variáveis (copie para .env)
├── apps/
│   ├── api/                    # Backend NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # modelo de dados
│   │   │   ├── migrations/     # migration inicial (SQL)
│   │   │   └── seed.ts         # dados de demonstração (idempotente)
│   │   └── src/
│   │       ├── domain/finance/ # motor financeiro PURO (+ testes .spec.ts)
│   │       ├── common/         # filtros, guards, cripto, auditoria, utils
│   │       ├── prisma/         # PrismaService
│   │       └── modules/        # auth, users, customers, proposals,
│   │                           # analysis, contracts, payments,
│   │                           # collections, dashboard, audit
│   └── web/                    # Frontend React + Vite
│       └── src/
│           ├── lib/            # api client, auth, tipos, formatação
│           ├── components/     # Layout, DataTable, UI primitives
│           └── pages/          # Login, Dashboard, Clientes, Propostas...
```

---

## 🐳 Como rodar com Docker — recomendado

Pré-requisitos: **Docker** e **Docker Compose**.

```bash
# 1. clone e entre na pasta
cd credflow

# 2. crie o arquivo de ambiente
cp .env.example .env
#   (opcional, mas recomendado: gere segredos reais)
#   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET:  openssl rand -hex 48
#   ENCRYPTION_KEY (32 bytes base64):        openssl rand -base64 32

# 3. suba tudo (banco + API + frontend)
docker compose up --build
```

O container da API aplica **migrations** e roda o **seed** automaticamente no start.

| Serviço | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3333/api |
| Swagger (docs) | http://localhost:3333/api/docs |
| PostgreSQL | localhost:5432 |

Login inicial: **`admin@credflow.dev` / `Admin@123456`**.

---

## 💻 Como rodar localmente (sem Docker)

Pré-requisitos: **Node 20+** e um **PostgreSQL** acessível.

### 1. Banco
Crie um banco e ajuste `DATABASE_URL`. Exemplo:
```
postgresql://credflow:credflow_secret@localhost:5432/credflow?schema=public
```

### 2. Backend
```bash
cd apps/api
cp ../../.env.example .env          # ajuste DATABASE_URL e os segredos
npm install
npx prisma generate
npx prisma migrate deploy           # aplica a migration inicial
npm run db:seed                     # popula dados de demonstração
npm run start:dev                   # API em http://localhost:3333/api
```

### 3. Frontend
```bash
cd apps/web
cp .env.example .env                # VITE_API_URL=http://localhost:3333
npm install
npm run dev                         # http://localhost:5173
```

---

## 🔧 Variáveis de ambiente

| Variável | Descrição | Exemplo / padrão |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do Postgres (Docker) | `credflow` / `credflow_secret` / `credflow` |
| `DATABASE_URL` | String de conexão Prisma | `postgresql://credflow:credflow_secret@db:5432/credflow?schema=public` |
| `NODE_ENV` | Ambiente | `development` / `production` |
| `API_PORT` | Porta da API | `3333` |
| `CORS_ORIGIN` | Origens permitidas (separadas por vírgula) | `http://localhost:5173` |
| `JWT_ACCESS_SECRET` | Segredo do access token (≥16 chars) | `openssl rand -hex 48` |
| `JWT_REFRESH_SECRET` | Segredo do refresh token (≥16 chars) | `openssl rand -hex 48` |
| `JWT_ACCESS_TTL` | Validade do access token | `900s` |
| `JWT_REFRESH_TTL` | Validade do refresh token | `7d` |
| `ENCRYPTION_KEY` | Chave AES-256 (**32 bytes em base64**) | `openssl rand -base64 32` |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Janela (s) e limite de requisições | `60` / `120` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Admin criado no seed | `admin@credflow.dev` / `Admin@123456` |
| `VITE_API_URL` | URL da API usada pelo frontend | `http://localhost:3333` |

> A API valida no boot (fail-fast) a presença dos segredos e que `ENCRYPTION_KEY` decodifica para exatamente 32 bytes.

---

## 💾 Banco de dados, migrations e seed

- **Schema:** `apps/api/prisma/schema.prisma` (17 modelos, enums nativos).
- **Migration inicial:** `apps/api/prisma/migrations/0_init/migration.sql` — gerada a partir do schema; aplique com `npx prisma migrate deploy`.
- **Criar novas migrations (dev):** `npx prisma migrate dev --name <nome>`.
- **Seed (idempotente):** `npm run db:seed` — cria usuários, 10 clientes, propostas em vários status, contratos com parcelas/pagamentos, um caso de cobrança em atraso e propostas standalone. Reexecutar não duplica o ciclo de empréstimos.
- **Prisma Studio:** `npm run prisma:studio` para inspecionar os dados.

---

## 🧪 Testes

```bash
cd apps/api
npm test            # testes unitários (motor financeiro, política, documentos)
npm run test:e2e    # e2e do pipeline HTTP de simulação (sem DB)
npm run test:cov    # cobertura
```

O **motor financeiro** é coberto por testes que verificam:
amortização exata até saldo zero (Price/SAC/Simples), soma de parcelas = total,
CET ≥ taxa nominal quando há encargos, multa + mora pró-rata, e o motor de política
(aprovação automática, recusa por inadimplência, encaminhamento para análise manual).

Frontend: `cd apps/web && npm run typecheck` (e `npm run build` para validar o bundle).

---

## 📚 API e documentação (Swagger)

Documentação interativa em **`http://localhost:3333/api/docs`** (autenticação Bearer persistida).

Principais grupos de rotas (prefixo `/api`):

| Recurso | Rotas (resumo) |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Clientes | `GET/POST /customers`, `GET/PATCH /customers/:id`, `GET /customers/:id/financial-history`, `PATCH /customers/:id/status\|score` |
| Propostas | `POST /proposals/simulate`, `GET/POST /proposals`, `GET /proposals/:id`, `POST /proposals/:id/submit\|cancel` |
| Análise | `POST /proposals/:id/analyze`, `POST /proposals/:id/decision`, `GET /proposals/:id/analysis` |
| Contratos | `POST /contracts/from-proposal/:proposalId`, `GET /contracts`, `GET /contracts/:id`, `GET /contracts/installments/:id/charges` |
| Pagamentos | `POST /payments`, `POST /payments/installments/:id/settle`, `GET /payments` |
| Cobrança | `POST /collections/run`, `GET /collections`, `GET /collections/:id`, `POST /collections/:id/interactions\|promises`, `POST /collections/contracts/:id/renegotiate` |
| Dashboard | `GET /dashboard/overview` |
| Auditoria | `GET /audit` |

---

## 🔐 Perfis e permissões (RBAC)

`ADMIN` tem acesso total. Demais perfis (resumo das operações de escrita):

| Operação | ADMIN | MANAGER | ANALYST | OPERATOR | AUDITOR |
|---|:--:|:--:|:--:|:--:|:--:|
| Gerenciar usuários | ✅ | — | — | — | — |
| Criar/editar clientes | ✅ | ✅ | ✅ | ✅ | — |
| Criar propostas / simular | ✅ | ✅ | ✅ | ✅ | — |
| Analisar / decidir crédito | ✅ | ✅ | ✅ | — | — |
| Gerar contrato | ✅ | ✅ | ✅ | — | — |
| Registrar pagamentos | ✅ | ✅ | — | ✅ | — |
| Renegociar dívida | ✅ | ✅ | — | — | — |
| Régua de cobrança / interações | ✅ | ✅ | — | ✅ | — |
| Consultar auditoria | ✅ | ✅ | — | — | ✅ |
| Leitura geral (dashboards, listas) | ✅ | ✅ | ✅ | ✅ | ✅ |

Senhas dos perfis no seed: `gerente@credflow.dev / Gerente@123`, `analista@credflow.dev / Analista@123`, `operador@credflow.dev / Operador@123`, `auditor@credflow.dev / Auditor@123`.

---

## 💰 Motor financeiro

- **Tabela Price** (parcela fixa): `PMT = PV · i / (1 − (1+i)⁻ⁿ)`.
- **SAC**: amortização constante, parcelas decrescentes.
- **Juros simples**: `J = PV · i · n`.
- **CET**: taxa efetiva (IRR por bisseção) que iguala o valor **liberado** ao fluxo de parcelas — reflete IOF/TAC financiados; anualizada por `(1+i)¹² − 1`.
- **Encargos de mora**: multa única (% sobre o saldo) + juros de mora **pró-rata diário** (`taxa mensal / 30 × dias`).
- **Arredondamento**: tudo em centavos; resíduo ajustado na última parcela para o saldo fechar **exatamente** em zero.
- **Política de crédito** (`domain/finance/credit-policy.ts`): configurável (faixas de score, comprometimento máximo, fatores de limite, versão), retornando decisão + **motivos** auditáveis.

---

## 🔒 Segurança (OWASP)

- **A01 Broken Access Control** — `JwtAuthGuard` global + `RolesGuard` por papel; rotas públicas explícitas com `@Public()`.
- **A02 Cryptographic Failures** — Argon2id para senhas; **AES-256-GCM** para PII sensível em repouso (CPF/CNPJ do cliente e nº de documentos), com **blind index** determinístico para unicidade/busca e chave validada no boot.
- **A03 Injection** — Prisma (consultas parametrizadas) + `ValidationPipe` (whitelist, `forbidNonWhitelisted`).
- **A04 Insecure Design** — máquinas de estado, transações no banco, dinheiro em centavos.
- **A05 Misconfiguration** — Helmet, CORS restrito por env, validação fail-fast de variáveis.
- **A07 Auth Failures** — refresh com **rotação e revogação**, verificação contra timing-attack no login, invalidação de sessões na troca de senha, rate limiting.
- **A09 Logging** — trilha de auditoria append-only (`AuditLog`) para operações sensíveis.

---

## 🌱 Dados de demonstração

Após o seed você terá: 5 usuários (um por perfil), 10 clientes (PF/PJ, scores variados),
propostas em **DRAFT/UNDER_REVIEW/REJECTED**, contratos **ativos**, um **quitado**,
um **inadimplente** (com caso de cobrança, interação e promessa) e pagamentos registrados —
suficiente para o dashboard exibir números reais.

---

## 🚀 Guia de deploy

1. **Banco:** provisione um PostgreSQL gerenciado (RDS, Cloud SQL, Neon, etc.) e configure `DATABASE_URL`.
2. **Segredos:** gere `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -hex 48`) e `ENCRYPTION_KEY` (`openssl rand -base64 32`). **Nunca** use os valores de exemplo em produção.
3. **API:** build da imagem `apps/api` (multi-stage já incluído). No start, o container roda `prisma migrate deploy` e sobe a API. Rode atrás de HTTPS (proxy/ingress) e ajuste `CORS_ORIGIN` para o domínio do frontend.
4. **Frontend:** build de `apps/web` com `VITE_API_URL` apontando para a API pública; servido por Nginx (imagem incluída) ou em um CDN/objeto estático.
5. **Cobrança agendada:** `POST /collections/run` pode ser disparado por um cron/worker diário para atualizar a inadimplência automaticamente.
6. **Observabilidade:** logs estruturados via `LoggingInterceptor`; adicione APM/metrics conforme a infra.

---

## 🩺 Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| API não sobe: *"Missing required environment variables"* | Copie `.env.example` para `.env` e preencha os segredos. |
| *"ENCRYPTION_KEY must be 32 bytes…"* | Gere com `openssl rand -base64 32`. |
| Frontend não autentica / CORS | Confira `VITE_API_URL` e `CORS_ORIGIN` (devem bater com as URLs em uso). |
| `migrate deploy` falha | Verifique `DATABASE_URL` e se o Postgres está acessível/healthy. |
| Porta ocupada | Ajuste `API_PORT`/portas no `docker-compose.yml`. |

---

Construído como base **real** de produção — domínio bem modelado, cálculos corretos e verificados, segurança e auditoria de primeira classe.
