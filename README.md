# Lever

Plataforma de experimentação com um sistema de recomendação acoplado: feature flags, testes A/B com análise estatística, recomendação (embeddings + ranqueamento) e agentes de IA que interpretam resultados. Uma loja de demonstração usa o Lever para provar que tudo funciona.

- Visão completa: [`docs/ideacao.md`](docs/ideacao.md)
- Regras para quem escreve código (pessoas e agentes): [`AGENTS.md`](AGENTS.md)
- Specs (Spec-Driven Development): [`specs/`](specs/). A fase atual é a [001 — Plataforma base](specs/001-plataforma-base/spec.md).

## Estado atual

A etapa `base` da spec 001 está pronta: monorepo, configurações compartilhadas, contratos Zod, banco (schema, migrations e seed) e infraestrutura local. O console, o serviço de decisão, o SDK e a loja chegam nas próximas worktrees (seção 11 da spec).

## Pré-requisitos

- **Node.js 24** (há um `.nvmrc`)
- **pnpm 12**, via corepack (a versão exata está em `packageManager`, no `package.json`)
- **Docker** com Docker Compose v2 (Docker Desktop no Windows e no macOS)

```bash
corepack enable pnpm
```

No Windows, se o Node estiver em `C:\Program Files` e o comando falhar com `EPERM`, instale o atalho numa pasta do usuário que esteja no `PATH`:

```bash
corepack enable --install-directory "$(npm prefix -g)" pnpm
```

## Como subir o projeto

```bash
cp .env.example .env     # valores fictícios para uso local
pnpm install             # dependências
docker compose up -d     # Postgres, Prometheus e Grafana
pnpm db:migrate          # aplica as migrations
pnpm db:seed             # dados de exemplo
pnpm test                # testes (usam Testcontainers: o Docker precisa estar rodando)
```

Se alguma porta já estiver em uso na sua máquina, troque-a no `.env` (`POSTGRES_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT`). Se trocar a do Postgres, ajuste também o `DATABASE_URL`.

| Serviço    | Endereço                | Acesso                                          |
| ---------- | ----------------------- | ----------------------------------------------- |
| Postgres   | `localhost:5432`        | usuário e senha do `.env`                       |
| Prometheus | <http://localhost:9090> | —                                               |
| Grafana    | <http://localhost:3001> | `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` |

### O que o seed cria

Todos os dados são fictícios:

- O projeto **Lever Demo Store** (`demo-store`), com os ambientes `development` e `production`.
- O usuário admin `admin@lever.local`.
- A flag booleana **`new-banner`**, desligada nos dois ambientes. Quando ligada, serve `true` para 100% dos usuários.
- O experimento **`checkout-layout`**, 50/50 entre `one-page` (controle) e `multi-step`. Está `running` em `development` e `draft` em `production`.

O seed pode ser rodado mais de uma vez sem duplicar dados.

## Scripts

| Comando                    | O que faz                                                            |
| -------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                 | Sobe todos os apps e serviços em modo de desenvolvimento             |
| `pnpm build`               | Compila todos os pacotes                                             |
| `pnpm test`                | Vitest em todo o monorepo                                            |
| `pnpm lint`                | ESLint em todo o monorepo                                            |
| `pnpm typecheck`           | `tsc --noEmit` em todo o monorepo                                    |
| `pnpm format`              | Formata o código com Prettier (`format:check` só verifica)           |
| `pnpm db:migrate`          | Aplica as migrations no banco do `DATABASE_URL`                      |
| `pnpm db:seed`             | Insere os dados de exemplo                                           |
| `pnpm --filter <pacote> …` | Roda um script em um pacote só (ex.: `pnpm --filter @lever/db test`) |

Para criar uma migration depois de alterar `packages/db/src/schema`, rode `pnpm --filter @lever/db db:generate`. Só uma worktree por vez pode criar migrations (AGENTS.md).

## Estrutura

```
apps/
  console/          Next.js — console do Lever (worktree console)
  store/            Next.js — loja de demonstração (worktree store)
services/
  decision/         Fastify — configuração, avaliação e stream (worktree decision)
  collector/        fase 2
  recommendation/   fase 3
  agents/           fase 4
packages/
  config/           tsconfig, ESLint e Prettier compartilhados
  schemas/          contratos Zod (fonte da verdade dos tipos) e formato de erro
  db/               schema Drizzle, migrations, seed e testes de integração
  sdk/              SDK TypeScript (worktree sdk)
ml/                 fase 3
infra/              docker-compose, Prometheus, Grafana, k6
specs/              specs do SDD
docs/               ideação e ADRs
```

## CI

O GitHub Actions roda `install`, `format:check`, `lint`, `typecheck` e `test` em todo push e pull request (`.github/workflows/ci.yml`).
