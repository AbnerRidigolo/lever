# Lever

Plataforma de experimentação com um sistema de recomendação acoplado: feature flags, testes A/B com análise estatística, recomendação (embeddings + ranqueamento) e agentes de IA que interpretam resultados. Uma loja de demonstração usa o Lever para provar que tudo funciona.

- Visão completa: [`docs/ideacao.md`](docs/ideacao.md)
- Regras para quem escreve código (pessoas e agentes): [`AGENTS.md`](AGENTS.md)
- Specs (Spec-Driven Development): [`specs/`](specs/). A fase atual é a [001 — Plataforma base](specs/001-plataforma-base/spec.md).

## Estado atual

Da spec 001 estão prontos:

- **Etapa `base`:** monorepo, configurações compartilhadas, contratos Zod, banco (schema, migrations e seed) e infraestrutura local.
- **Etapa `decision`:** o serviço de decisão em [`services/decision`](services/decision/README.md). A atribuição de variantes e a avaliação de regras são do autor e ainda lançam `not implemented`, então `/v1/evaluate` responde 500 até lá.
- **Etapa `console`:** o console em [`apps/console`](apps/console/README.md), em <http://localhost:3000>.
- **Etapa `sdk`:** o SDK para servidor em [`packages/sdk`](packages/sdk/README.md) (veja [SDK](#sdk)).
- **Etapa `store`:** a loja de demonstração em [`apps/store`](apps/store/README.md), em <http://localhost:3002>. Até o SDK chegar, ela usa um stub, sem serviço de decisão.

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
docker compose up -d     # Postgres, Prometheus, Grafana, Tempo e Mailpit
pnpm db:migrate          # aplica as migrations
pnpm db:seed             # dados de exemplo
pnpm test                # testes (usam Testcontainers: o Docker precisa estar rodando)
```

Se alguma porta já estiver em uso na sua máquina, troque-a no `.env` (`POSTGRES_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT`, `TEMPO_PORT`, `OTLP_HTTP_PORT`). Se trocar a do Postgres, ajuste também o `DATABASE_URL`.

| Serviço    | Endereço                | Acesso                                          |
| ---------- | ----------------------- | ----------------------------------------------- |
| Postgres   | `localhost:5432`        | usuário e senha do `.env`                       |
| Prometheus | <http://localhost:9090> | —                                               |
| Mailpit    | <http://localhost:8025> | caixa de entrada local dos links mágicos        |
| Grafana    | <http://localhost:3001> | `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` |
| Tempo      | `localhost:4318` (OTLP) | traces, vistos no Grafana (datasource Tempo)    |
| Loja       | <http://localhost:3002> | `pnpm --filter @lever/store dev`                |

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
| `pnpm test:e2e`            | Playwright do console (precisa de Postgres e Mailpit) e da loja      |
| `pnpm lint`                | ESLint em todo o monorepo                                            |
| `pnpm typecheck`           | `tsc --noEmit` em todo o monorepo                                    |
| `pnpm format`              | Formata o código com Prettier (`format:check` só verifica)           |
| `pnpm db:migrate`          | Aplica as migrations no banco do `DATABASE_URL`                      |
| `pnpm db:seed`             | Insere os dados de exemplo                                           |
| `pnpm --filter <pacote> …` | Roda um script em um pacote só (ex.: `pnpm --filter @lever/db test`) |

Para criar uma migration depois de alterar `packages/db/src/schema`, rode `pnpm --filter @lever/db db:generate`. Só uma worktree por vez pode criar migrations (AGENTS.md).

## SDK

O app cliente avalia flags e variantes localmente com `@lever/sdk`, sem chamada de rede por avaliação:

```ts
import { createLeverClient } from '@lever/sdk';

const lever = createLeverClient({ apiKey: 'lvr_dev_...', baseUrl: 'http://localhost:4000' });
await lever.ready();

const user = { id: 'anon-123', attributes: { country: 'BR', device: 'mobile' } };
lever.getFlag('new-banner', user, false);
lever.getVariant('checkout-layout', user);
```

Detalhes, comportamento com o serviço fora do ar e métricas em [`packages/sdk/README.md`](packages/sdk/README.md).

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

## Medições dos requisitos não funcionais

Seção 12 da [spec 001](specs/001-plataforma-base/spec.md): as NFR-001 a NFR-005 medidas e registradas aqui. O plano das medições está em [`plan-quality.md`](specs/001-plataforma-base/plan-quality.md).

| NFR     | Meta                                              | Como foi medido                                                                        | Resultado                                                                                                        | Data       | Commit    | Status              |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- | --------- | ------------------- |
| NFR-001 | Avaliação local no SDK: p99 abaixo de 1 ms        | Vitest bench no `packages/sdk`                                                         | —                                                                                                                | —          | —         | pendente (SDK)      |
| NFR-002 | Avaliação remota: p99 abaixo de 20 ms a 500 req/s | `k6 run -e SCENARIO=evaluate infra/k6/evaluate.js`                                     | Não medida: `POST /v1/evaluate` responde 500 até a avaliação do autor existir (`packages/evaluation`)            | 04/11/2026 | `7df9a37` | pendente            |
| NFR-002 | Referência: `GET /v1/config` nas mesmas condições | `k6 run -e SCENARIO=config infra/k6/evaluate.js`                                       | p50 0,51 ms, p95 1,74 ms, **p99 3,82 ms**, máx. 56,69 ms; 0% de falhas e nenhuma iteração descartada a 500 req/s | 04/11/2026 | `7df9a37` | referência          |
| NFR-003 | Propagação do console até o SDK abaixo de 5 s     | E2E `apps/console/e2e/flag.spec.ts` (console até o `/v1/config` do serviço de decisão) | **182 ms** (anotação `NFR-003` do Playwright)                                                                    | 04/11/2026 | `7df9a37` | parcial (sem o SDK) |
| NFR-004 | Decisão continua servindo se o Postgres cair      | `services/decision/test/resilience.test.ts` (para o contêiner do Postgres)             | Passa: `/v1/config`, a key em cache e o stream continuam com a última configuração                               | 04/11/2026 | `0b64748` | atendido            |
| NFR-005 | Cobertura acima de 80% em `services/decision`     | `pnpm --filter @lever/decision test` (Vitest com cobertura v8 e limite de 80%)         | Linhas 98,56%, instruções 96,98%, funções 94,73%, ramos 91,93%                                                   | 04/11/2026 | `0b64748` | atendido            |
| NFR-005 | Cobertura acima de 80% em `packages/sdk`          | Vitest com cobertura no `packages/sdk`                                                 | —                                                                                                                | —          | —         | pendente (SDK)      |

**Ambiente das medições:** notebook com Windows 11, Intel Core i7-13650HX (14 núcleos, 20 threads) e 32 GB de RAM, Node 24.18.0. O k6 v2.2.0 (binário local) rodou na mesma máquina que o serviço. O serviço de decisão rodou compilado (`node dist/main.js`) na porta 4200, com `LOG_LEVEL=warn` e sem traces (`OTEL_EXPORTER_OTLP_ENDPOINT` vazio). O Postgres rodou no Docker Desktop (`pgvector/pgvector:0.8.7-pg17-trixie`), com o seed. Cada execução do k6 teve 15 s de aquecimento a 100 req/s e 60 s medidos a 500 req/s. A máquina tinha outros contêineres no ar, sem relação com o Lever. Os números são locais e servem para comparar execuções na mesma máquina.

## CI

O GitHub Actions roda `install`, `format:check`, `lint`, `typecheck` e `test` em todo push e pull request (`.github/workflows/ci.yml`).
