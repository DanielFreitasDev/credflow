# Contribuindo com o CredFlow

Obrigado por contribuir! Este guia resume o fluxo de desenvolvimento e o que o
CI exige antes de um merge.

## Pré-requisitos

- **Node 20** (use o `.nvmrc` de cada app: `nvm use` em `apps/api` e `apps/web`).
- **Docker** + Docker Compose (stack completa) e **PostgreSQL 16** para a API.

> O repositório são **dois projetos npm independentes** sob `apps/` — não há
> `package.json` raiz. Sempre entre no app antes de rodar scripts.

## Setup rápido

```bash
# Stack completa (db + api + web)
cp .env.example .env
docker compose up --build

# Ou por app, para desenvolvimento
cd apps/api && npm ci && npx prisma generate && npm run start:dev
cd apps/web && npm ci && npm run dev
```

## Fluxo de trabalho

1. Crie uma branch a partir de `main`: `git checkout -b feat/minha-mudanca`.
2. Faça commits pequenos e descritivos (ver convenção abaixo).
3. Abra um Pull Request para `main` e preencha o template.
4. Garanta que **todos os checks do CI** estão verdes (eles são obrigatórios).
5. Aguarde a revisão (CODEOWNERS é solicitado automaticamente nas áreas sensíveis).

> `main` é protegida: sem push direto, sem force-push e sem merge com CI vermelho.

## Rodando os checks do CI localmente

Espelhe o pipeline antes de abrir o PR:

```bash
# API
cd apps/api
npx prisma generate
npm run typecheck
npx eslint "src/**/*.ts"
npm run build
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high

# Web
cd apps/web
npm run typecheck
npm run lint
npm test
npm run build
```

## Banco de dados / migrations

- Crie migrations com `npx prisma migrate dev --name <nome>` em `apps/api`.
- **Nunca** edite uma migration já aplicada/commitada — crie uma nova.
- Toda alteração em `schema.prisma` precisa de uma migration: o job
  `api-integration` do CI roda `prisma migrate deploy` + um **drift check** que
  falha se o schema divergir das migrations.
- CHECK constraints e índices em SQL cru vivem só nas migrations (o Prisma não
  os modela) — mantenha esse padrão.

## Convenção de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.

## Segurança

- **Nunca** commite `.env` ou segredos (o `gitleaks` no CI varre o histórico).
- Dinheiro é sempre **centavos inteiros** no domínio (`domain/finance`); não
  introduza matemática em ponto flutuante para valores monetários.
- Para relatar vulnerabilidades, veja [`SECURITY.md`](./SECURITY.md).

## Código & estilo

- Código e comentários em **inglês**; domínio/UI em **pt-BR**.
- ESLint (flat config) é a fonte de verdade de estilo; rode `npm run lint`.
