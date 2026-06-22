# Política de Segurança

O CredFlow é uma plataforma de crédito que processa **dados pessoais sensíveis
(CPF/CNPJ)** e **valores financeiros**. Levamos segurança a sério e agradecemos
relatos responsáveis.

## Versões suportadas

| Versão | Suportada |
|--------|-----------|
| `main` (mais recente) | ✅ |
| Releases anteriores | ❌ (atualize para a mais recente) |

## Como relatar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança.

Use o **Private Vulnerability Reporting** do GitHub:
`Security` → `Report a vulnerability` (aba Security do repositório).

Inclua, se possível:
- Descrição e impacto potencial;
- Passos para reproduzir (PoC);
- Componente afetado (`apps/api`, `apps/web`, infraestrutura);
- Versão/commit.

### Expectativa de resposta
- **Confirmação de recebimento:** até 3 dias úteis.
- **Avaliação inicial / severidade:** até 7 dias úteis.
- **Correção:** priorizada por severidade (CVSS). Vulnerabilidades críticas que
  exponham PII ou permitam fraude financeira têm prioridade máxima.

Pedimos que aguarde a correção antes de divulgar publicamente (disclosure
coordenado).

## Escopo de interesse

Tem prioridade tudo que afete:
- Autenticação/autorização (JWT, rotação de refresh, RBAC, lockout);
- Vazamento de PII (CPF/CNPJ, criptografia em repouso, blind index, logs);
- Integridade dos cálculos financeiros (juros, CET, amortização, alocação de pagamentos);
- Idempotência de cobrança / pagamentos duplicados;
- Injeção (SQL via Prisma raw, XSS no frontend), SSRF, IDOR;
- Configuração de produção (segredos, CORS, headers, exposição do Swagger/metrics).

## Fora de escopo (em geral)
- Relatos automatizados de scanners sem impacto demonstrável;
- Ausência de headers em endpoints sem dados sensíveis;
- Engenharia social e ataques físicos.

## Práticas já adotadas
Argon2id, JWT HS256 com rotação e detecção de reuso, lockout de conta,
AES-256-GCM para PII com blind index HMAC, RBAC default-deny, Helmet, rate
limiting, validação fail-fast de ambiente, trilha de auditoria append-only e
imagens Docker non-root. Detalhes no `README.md`.
