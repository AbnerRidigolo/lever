# Plano — Spec 001, etapa `base` (worktree de ordem 0)

| Campo  | Valor                                                                           |
| ------ | ------------------------------------------------------------------------------- |
| Spec   | `specs/001-plataforma-base/spec.md`                                             |
| Etapa  | `base` (seção 11, ordem 0)                                                      |
| Status | Aprovado pelo autor em 29/10/2026 (todas as propostas da seção 7 aceitas)       |
| Escopo | monorepo, `packages/config`, `packages/schemas`, `packages/db`, infra local, CI |

## 0. Observações antes de começar

- **A spec estava em `Spec.md` na raiz.** Movi para `specs/001-plataforma-base/spec.md`, que é o caminho que o AGENTS.md e a tarefa esperam. O conteúdo não mudou.
- **A ideação estava em `ideacao.md`, na raiz.** Movi para `docs/ideacao.md`, o caminho que o AGENTS.md cita. Li o documento inteiro. Ele não muda o escopo desta etapa e só levanta a dúvida Q8 (pgvector).
- **pnpm não está instalado na máquina.** O Node é 24.18 e traz o corepack 0.35, então o projeto fixa `packageManager: pnpm@<versão>` no `package.json` e o README orienta a rodar `corepack enable`.
- O repositório não tem nenhum commit. O `.mcp.json` não rastreado é seu e não vai entrar nos commits.

## 1. Versões

Consultei o registro do npm em 29/10/2026. Regra: versões exatas no `package.json` (sem `^`), sempre a mais recente estável que seja **compatível com as outras** e tenha **pelo menos 2 semanas de publicação**. Versões já ajustadas pela regra das 2 semanas (corte: 15/10/2026).

| Ferramenta / pacote        | Versão                                                                       | Observação                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js                    | 24 (LTS)                                                                     | `engines.node: ">=24"` e `.nvmrc` com `24`                                         |
| pnpm                       | 12.14.0                                                                      | Via corepack (`packageManager`). A 12.16.1 é de 27/10                              |
| turbo                      | 2.11.8                                                                       | A 2.11.10 é de 20/10                                                               |
| typescript                 | **6.0.3**                                                                    | A 7.0.2 já existe, mas o typescript-eslint 8.71 só aceita `<6.1.0`. Fico na 6.0.3. |
| zod                        | 4.6.7                                                                        |                                                                                    |
| drizzle-orm                | 0.45.4                                                                       |                                                                                    |
| drizzle-kit                | 0.31.11                                                                      | Gera as migrations                                                                 |
| postgres (postgres.js)     | 3.4.9                                                                        | Driver do Drizzle. A 4.0.0 saiu hoje (29/10)                                       |
| eslint                     | 10.12.0                                                                      | Flat config. A 10.13.0 é de 16/10                                                  |
| @eslint/js                 | 10.0.1                                                                       |                                                                                    |
| typescript-eslint          | 8.71.2                                                                       | A 8.72.1 é de 26/10. Preset `strictTypeChecked` + `stylisticTypeChecked`           |
| eslint-config-prettier     | 10.1.8                                                                       |                                                                                    |
| globals                    | 17.13.0                                                                      |                                                                                    |
| prettier                   | 3.9.10                                                                       |                                                                                    |
| vitest                     | 5.0.5                                                                        | Aceita Node `^24`                                                                  |
| @testcontainers/postgresql | 12.2.1                                                                       | Testes de integração com Postgres real                                             |
| tsx                        | 4.23.15                                                                      | Para rodar `migrate.ts` e `seed.ts`                                                |
| @types/node                | 24.19.2                                                                      | Linha 24, para casar com o runtime (não a 26)                                      |
| Imagem Postgres            | `pgvector/pgvector:0.8.7-pg17-trixie`                                        | Postgres 17 + pgvector (Q8)                                                        |
| Imagem `prom/prometheus`   | `v3.15.0`                                                                    |                                                                                    |
| Imagem `grafana/grafana`   | `13.2.4`                                                                     |                                                                                    |
| GitHub Actions             | `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` na major atual | Node 24 no runner                                                                  |

## 2. Decisões de arquitetura desta etapa

1. **Pacotes internos com escopo `@lever/*`**: `@lever/config`, `@lever/schemas`, `@lever/db`. ESM puro (`"type": "module"`), exports nomeados.
2. **`schemas` e `db` são compilados com `tsc` para `dist/`.** Os outros pacotes consomem o `dist` pelo campo `exports`. No Turborepo, `typecheck`, `test` e `build` dependem de `^build`. Funciona igual para Fastify e para Next.js nas próximas worktrees.
3. **Valores de configuração em pontos-base (bps)** em todo lugar (`rolloutBps`, `weightBps`, de 0 a 10.000), como a seção 7 define. O console converte de/para porcentagem.
4. **`docker compose up -d` na raiz funciona**: a raiz tem um `compose.yaml` que só faz `include: [infra/docker-compose.yml]`. Assim valem o comando do AGENTS.md e o arquivo que a tarefa pede em `infra/`.
5. **`audit_log` só aceita inserção também no banco**: a migration cria um trigger que rejeita `UPDATE` e `DELETE` (AC-6.2, FR-009). É SQL cru, mas fica em migration, como o AGENTS.md permite.
6. **"Exatamente um controle" e "soma = 10.000"**: o Zod valida na fronteira. No banco, um índice único parcial garante **no máximo um** controle por experimento. A soma não vira constraint no banco, porque exigiria um trigger diferido e as variantes são gravadas em várias linhas. Ver dúvida Q4.
7. **O seed usa UUIDs e salts fixos**, para que seja reproduzível e idempotente (`onConflictDoNothing`). Rodar `pnpm db:seed` duas vezes não duplica nada.
8. **Nada de lógica de atribuição ou avaliação.** `packages/schemas` só descreve formas (o operador `greater_than` existe como enum, mas ninguém o avalia aqui).

## 3. Tarefas em ordem

Cada tarefa vira **um commit** em Conventional Commits (o escopo vai entre parênteses).

### T1 — `chore: move spec 001 and record open-question decisions`

- `specs/001-plataforma-base/spec.md` (movido da raiz; seção 13 passa a registrar as 3 decisões, ver §5)
- `specs/001-plataforma-base/plan.md` (este arquivo)

### T2 — `chore: scaffold pnpm + turborepo monorepo`

- `package.json` (raiz, privado, `packageManager`, `engines`, scripts — ver T10)
- `pnpm-workspace.yaml` (`apps/*`, `services/*`, `packages/*`)
- `turbo.json` (tarefas `build`, `dev`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`, com `dependsOn` e `outputs`)
- `.nvmrc`, `.npmrc` (`engine-strict=true`)
- `.gitignore` (node_modules, dist, .turbo, coverage, .env, .env.*, exceto `.env.example`; `*.tsbuildinfo`; `.mcp.json`, pela Q7)
- `.editorconfig`, `.gitattributes` (`* text=auto eol=lf`, importante no Windows)
- READMEs curtos para as pastas futuras, sem `package.json`, então o pnpm ignora:
  - `apps/console/README.md`, `apps/store/README.md`
  - `services/decision/README.md`, `services/collector/README.md`, `services/recommendation/README.md`, `services/agents/README.md`
  - `packages/sdk/README.md`
  - `ml/README.md`
  - `docs/adr/README.md` (índice com os ADR-001 a 005 da seção 9 como "a escrever")
  - `infra/k6/README.md`

### T3 — `feat(config): add shared tsconfig, eslint and prettier`

- `packages/config/package.json` (`@lever/config`, exports dos arquivos abaixo)
- `packages/config/tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `module/moduleResolution: NodeNext`, `target: ES2024`, `declaration`, `sourceMap`
- `packages/config/tsconfig.library.json` (estende a base e emite em `dist/`)
- `packages/config/eslint.config.js` — exporta uma função `createConfig({ tsconfigRootDir })` com:
  - `@eslint/js` recommended + `typescript-eslint` `strictTypeChecked` e `stylisticTypeChecked`
  - `@typescript-eslint/no-explicit-any: error`
  - regra que proíbe `export default` (`no-restricted-syntax` em `ExportDefaultDeclaration`), com exceção para arquivos `*.config.*`
  - `eslint-config-prettier` por último
- `packages/config/prettier.config.js` (aspas simples, `semi: true`, `trailingComma: all`, `printWidth: 100`)
- Na raiz: `prettier.config.js` reexportando o compartilhado, `.prettierignore`, `eslint.config.js` para os arquivos da raiz e `tsconfig.json` (só `references`/`files: []`)

### T4 — `feat(schemas): add zod contracts for decision service and sdk`

Pacote `packages/schemas` (`@lever/schemas`), um arquivo por contrato e `src/index.ts` reexportando tudo:

| Arquivo                                                                                        | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/common.ts`                                                                                | `resourceKeySchema` (kebab-case, 1–64 caracteres), `basisPointsSchema` (inteiro 0–10.000), `environmentKeySchema` (`development` \| `production`), `projectRoleSchema` (`admin` \| `editor` \| `viewer`), `uuidSchema`                                                                                                                                                                           |
| `src/user-context.ts`                                                                          | `userContextSchema`: `{ id: string (não vazio), attributes: Record<string, string \| number \| boolean \| string[]> }` (seção 8)                                                                                                                                                                                                                                                                 |
| `src/segment.ts`                                                                               | `segmentOperatorSchema` com os 7 operadores (AC-4.2); `segmentConditionSchema` (`attribute`, `operator`, `value`), com o valor validado pelo operador: `in`/`not_in` exigem lista, `greater_than`/`less_than` exigem número, e assim por diante; `segmentRulesSchema` (`{ conditions: Condition[] }` com 1 a 20 condições, combinadas por **E**, ver Q1); `segmentConfigSchema` (`key`, `rules`) |
| `src/flag.ts`                                                                                  | `flagTypeSchema` (`boolean` \| `string` \| `number` \| `json`); `flagValueSchemaFor(type)`; `flagDefinitionSchema` (união discriminada por `type`, valida `defaultValue` e `servedValue` conforme o tipo, AC-1.4); `flagConfigSchema` (o que vai em `/v1/config`: `key`, `type`, `salt`, `defaultValue`, `enabled`, `servedValue`, `rolloutBps`, `segmentKey \| null`)                           |
| `src/experiment.ts`                                                                            | `experimentStatusSchema` (`draft`, `running`, `paused`, `completed`, AC-3.5); `experimentVariantSchema` (`key`, `weightBps`, `isControl`); `experimentVariantsSchema` (2 a 5 variantes, soma = 10.000, exatamente um controle, chaves únicas, AC-3.1); `experimentConfigSchema` (`key`, `salt`, `status`, `segmentKey \| null`, `variants`)                                                      |
| `src/config.ts`                                                                                | `environmentConfigSchema`: `{ version, flags, experiments, segments }` (resposta de `GET /v1/config`)                                                                                                                                                                                                                                                                                            |
| `src/stream.ts`                                                                                | `streamEventSchema`: união discriminada `config` (`data` = configuração completa com `version`) \| `ping` (`data: {}`), mais a constante `STREAM_PING_INTERVAL_MS = 15_000`                                                                                                                                                                                                                      |
| `src/evaluate.ts`                                                                              | `evaluateRequestSchema` (`user`, `flags?`, `experiments?`) e `evaluateResponseSchema` (`flags: Record<key, value>`, `experiments: Record<key, variantKey>`, `version`)                                                                                                                                                                                                                           |
| `src/exposure.ts`                                                                              | `exposureEventSchema`: `{ type: 'exposure', experimentKey, variantKey, userId, configVersion, timestamp }`, com `timestamp` em ISO 8601                                                                                                                                                                                                                                                          |
| `src/errors.ts`                                                                                | `errorCodeSchema` (`bad_request`, `validation_failed`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `internal`, `service_unavailable`); `apiErrorSchema` = `{ error: { code, message, details?, requestId? } }`; `ERROR_HTTP_STATUS` (código → status HTTP); `createApiError()` (função pura que monta o objeto)                                                        |
| `src/env.ts`                                                                                   | utilitário `parseEnv(schema, source)` que lança erro legível listando as variáveis inválidas (usado pelo `db` e pelos serviços futuros)                                                                                                                                                                                                                                                          |
| `src/*.test.ts`                                                                                | testes Vitest (ver §4)                                                                                                                                                                                                                                                                                                                                                                           |
| `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `eslint.config.js` | configuração do pacote                                                                                                                                                                                                                                                                                                                                                                           |

### T5 — `feat(db): add drizzle schema for phase 1 data model`

Pacote `packages/db` (`@lever/db`):

- `src/schema/` com um arquivo por agregado, todos reexportados por `src/schema/index.ts`:
  - `columns.ts`: helpers `id` (uuid, `defaultRandom`), `createdAt`, `updatedAt` (`$onUpdate`), todos `timestamptz`
  - `enums.ts`: `pgEnum` para `project_role`, `environment_key`, `flag_type`, `experiment_status`, `audit_action` (`create`, `update`, `delete`), `audit_resource_type` (`flag`, `experiment`, `segment`, `api_key`). Os valores vêm dos schemas Zod, sem duplicar.
  - `users.ts`: `users` (email único, name, avatar_url)
  - `projects.ts`: `projects` (name, slug único), `project_members` (único em project+user, role), `environments` (único em project+key)
  - `api-keys.ts`: `api_keys` (environment_id, name, key_prefix, key_hash único, last_used_at, revoked_at). O `key_prefix` vem da Q6
  - `segments.ts`: `segments` (único em project+key, rules jsonb tipado com `$type<SegmentRules>()`)
  - `flags.ts`: `flags` (único em project+key, type, default_value jsonb, salt), `flag_environments` (único em flag+environment, enabled, served_value, rollout_bps com `CHECK 0..10000`, segment_id nullable)
  - `experiments.ts`: `experiments` (único em project+key, hypothesis, status, salt, segment_id, started_at, ended_at), `experiment_variants` (único em experiment+key, weight_bps com `CHECK 0..10000`, is_control, índice único parcial `WHERE is_control`), `experiment_environments` (único em experiment+environment, status)
  - `audit.ts`: `audit_log` (project_id, actor_id, action, resource_type, resource_id, before, after jsonb, índices para os filtros da AC-6.2: `(project_id, resource_type, resource_id)`, `(project_id, actor_id)`, `(project_id, created_at)`)
  - `config-versions.ts`: `config_versions` (único em environment+version, published_at)
  - `relations.ts`: relações do Drizzle
- Chaves estrangeiras com `ON DELETE CASCADE` dentro do projeto. A exceção é `audit_log.actor_id`, que usa `RESTRICT` para que a auditoria não perca o autor, e `segment_id`, que também usa `RESTRICT` para não mudar o público de uma flag sem querer (ver Q5).
- `src/env.ts`: `DATABASE_URL` validada com Zod
- `src/client.ts`: `createDb(url)`, que devolve `{ db, close }` (postgres.js + drizzle)
- `src/index.ts`: exports públicos (`createDb`, `schema`, tipos `InferSelectModel`/`InferInsertModel`)
- `drizzle.config.ts` (o `export default` aqui é exigido pela ferramenta; fica na exceção da regra do lint)

### T6 — `feat(db): add initial migration and migrate script`

- `packages/db/migrations/0000_initial.sql` e `migrations/meta/*` (gerados pelo `drizzle-kit generate`, nunca editados à mão)
- `packages/db/migrations/0001_audit_log_append_only.sql` (gerado com `drizzle-kit generate --custom`): uma função e um trigger `BEFORE UPDATE OR DELETE ON audit_log` que lançam exceção, e um trigger `BEFORE TRUNCATE`
- `packages/db/src/migrate.ts`: aplica as migrations com o migrator do Drizzle e lê `DATABASE_URL` validada
- scripts do pacote: `db:generate`, `db:migrate`

### T7 — `feat(db): add seed with demo project, flag and experiment`

- `packages/db/src/seed/data.ts`: dados fictícios com IDs e salts fixos
  - usuário `admin@lever.local` / "Admin Demo"
  - projeto "Lever Demo Store" / `demo-store`, com o admin como `admin`
  - ambientes `development` e `production`
  - flag `new-banner`: `boolean`, padrão `false`, `served_value: true`, desligada nos dois ambientes, `rollout_bps: 10000`, sem segmento (pronta para a AC-1.1)
  - experimento `checkout-layout`, com hipótese fictícia e variantes `one-page` (controle, 5.000 bps) e `multi-step` (5.000 bps). Status: ver Q3.
  - `config_versions` com versão 1 em cada ambiente
  - **sem API key no seed** (ver Q6)
- `packages/db/src/seed/index.ts`: roda tudo numa transação, valida os dados com os schemas Zod antes de inserir e é idempotente
- script do pacote: `db:seed`

### T8 — `test(db): add integration tests with testcontainers`

- `packages/db/test/setup.ts`: sobe um `PostgreSqlContainer` (`pgvector/pgvector:0.8.7-pg17-trixie`, a mesma tag do compose), roda as migrations e devolve o `db`
- `packages/db/test/*.test.ts` (ver §4)
- `packages/db/vitest.config.ts` com `testTimeout` maior e `fileParallelism: false`

### T9 — `feat(infra): add docker compose with postgres, prometheus and grafana`

- `infra/docker-compose.yml`:
  - `postgres` (`pgvector/pgvector:0.8.7-pg17-trixie`), volume nomeado, `healthcheck` com `pg_isready`, porta `${POSTGRES_PORT:-5432}`, credenciais lidas do `.env`
  - `prometheus` (`v3.15.0`), porta 9090, `infra/prometheus/prometheus.yml`
  - `grafana` (`13.2.4`), porta 3001 (a 3000 fica para o console), login anônimo desligado e senha de admin vinda do `.env`
- `compose.yaml` (raiz): `include` do arquivo acima
- `infra/prometheus/prometheus.yml`: faz scrape do próprio Prometheus, mais um job comentado para `services/decision` em `host.docker.internal`, que a worktree `decision` ativa
- `infra/grafana/provisioning/datasources/prometheus.yml`
- `infra/grafana/provisioning/dashboards/lever.yml`, apontando para `infra/grafana/dashboards/`
- `infra/grafana/dashboards/.gitkeep` (o dashboard `Lever / Decisão` é da worktree `quality`)

### T10 — `chore: add root scripts, env example and readme`

- Scripts do `package.json` da raiz:
  - `dev` → `turbo run dev`
  - `build` → `turbo run build`
  - `test` → `turbo run test`
  - `lint` → `turbo run lint`
  - `typecheck` → `turbo run typecheck`
  - `db:migrate` → `turbo run db:migrate --filter=@lever/db` (compila os `^build` antes)
  - `db:seed` → `turbo run db:seed --filter=@lever/db`
  - extras: `format` e `format:check` (Prettier)
- `.env.example`: `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `GRAFANA_ADMIN_PASSWORD`, todos fictícios. Os pacotes leem o `.env` da raiz com `node --env-file-if-exists` (Node 24, sem depender de `dotenv`).
- `README.md`: o que é o Lever (resumo), pré-requisitos (Node 24, corepack, Docker), passo a passo (`corepack enable` → `cp .env.example .env` → `pnpm install` → `docker compose up -d` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm test`), portas, estrutura de pastas e links para AGENTS.md e specs

### T11 — `ci: add github actions workflow`

- `.github/workflows/ci.yml`: roda em `push` e `pull_request`, em `ubuntu-latest`, com `concurrency` cancelando execuções antigas. Passos: checkout → `pnpm/action-setup` → `setup-node` (24, cache do pnpm) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test`. O runner já tem Docker, então o Testcontainers funciona sem serviço extra. Também roda `pnpm format:check`.

### T12 — Verificação final (sem commit, salvo correções)

Rodo, nesta ordem, e mostro a saída: `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck` e `pnpm test`.

## 4. Testes desta etapa

Esta etapa não implementa nenhum comportamento de ponta a ponta, então nenhuma AC fica **completamente** coberta aqui. Os testes cobrem a parte de **contrato e dados** de cada AC e trazem o ID no nome, por exemplo `it('AC-3.1 (contract): rejects variants whose weights do not sum to 10000')`.

| Arquivo                            | O que verifica                                                                                                             | AC / FR relacionados                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `schemas/src/flag.test.ts`         | valor padrão e servido batem com o tipo (boolean, string, number, json) e há rejeições claras                              | AC-1.4 (contrato), FR-002                 |
| `schemas/src/experiment.test.ts`   | 2 a 5 variantes, soma 10.000, exatamente um controle, chaves únicas, 4 estados                                             | AC-3.1, AC-3.5 (contrato), FR-003         |
| `schemas/src/segment.test.ts`      | os 7 operadores, a forma do valor por operador e o exemplo `country = BR` e `device in [mobile]`                           | AC-4.1, AC-4.2 (contrato)                 |
| `schemas/src/user-context.test.ts` | tipos de atributo permitidos e rejeição de objetos aninhados                                                               | seção 8                                   |
| `schemas/src/contracts.test.ts`    | `/v1/config`, `/v1/evaluate`, eventos de stream e exposição aceitam exemplos válidos e rejeitam inválidos                  | FR-005, FR-006, FR-007, AC-5.7 (contrato) |
| `schemas/src/errors.test.ts`       | formato padrão de erro e mapa código → status                                                                              | AC-7.2 (o 403 usa `forbidden`)            |
| `db/test/migrations.test.ts`       | as migrations aplicam do zero num Postgres 17 real e todas as tabelas da seção 7 existem                                   | seção 7                                   |
| `db/test/constraints.test.ts`      | chaves únicas por projeto, `rollout_bps` fora de 0–10.000 rejeitado, dois controles rejeitados, membro duplicado rejeitado | FR-001, FR-002, FR-003                    |
| `db/test/audit-log.test.ts`        | `UPDATE`, `DELETE` e `TRUNCATE` em `audit_log` falham                                                                      | AC-6.2 (camada do banco), FR-009          |
| `db/test/seed.test.ts`             | o seed cria o esperado e rodar duas vezes não duplica                                                                      | AC-8.2 e AC-8.3 (dados)                   |

## 5. Registro na seção 13 da spec

A seção 13 vira "Questões em aberto e decisões", com uma tabela:

| Questão                                                       | Decisão (29/10/2026)                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| O id anônimo da loja é substituído pelo id da conta no login? | Sim. No login, o id da conta substitui o id anônimo. Consequência registrada: a variante pode mudar no momento do login. |
| Camadas de experimentos mutuamente exclusivos                 | Ficam para a spec 002.                                                                                                   |
| SDK para o navegador nesta fase?                              | Não. Nesta fase o SDK é só para servidor.                                                                                |

## 6. Fora do escopo desta etapa

`services/decision`, `packages/sdk`, `apps/console`, `apps/store`, qualquer lógica de atribuição, hash, bucketing ou avaliação de regras, ADRs (só o índice), dashboard do Grafana, k6, Playwright e o script `test:e2e`. As pastas dessas partes existem apenas com README.

## 7. Dúvidas (respondidas em 29/10/2026: todas as propostas aceitas; na Q6, a coluna `key_prefix` entra agora)

- **Q1 — Como as condições de um segmento se combinam.** A AC-4.1 só mostra um exemplo com "e". Proponho uma lista de condições combinadas sempre por **E** nesta fase. A estrutura `{ conditions: [...] }` permite adicionar grupos com **OU** depois sem quebrar nada. Pode ser?
- **Q2 — `experiments.status` e `experiment_environments.status` ao mesmo tempo.** A seção 7 tem as duas colunas. Proponho que `experiment_environments.status` seja o estado servido em `/v1/config` (por ambiente, como nas flags) e que `experiments.status` seja o estado geral mostrado no console. Ou devo remover uma das duas?
- **Q3 — Estado do `checkout-layout` no seed.** Proponho `running` em `development` e `draft` em `production`, de modo que a loja local já mostre as duas variantes. Pode ser?
- **Q4 — Soma de pesos = 10.000 garantida só pelo Zod**, sem constraint no banco (ver §2.6). Ou você quer um trigger diferido na migration?
- **Q5 — Apagar um segmento em uso.** Proponho `RESTRICT`: o banco impede apagar um segmento que ainda está ligado a uma flag ou experimento. Confirma?
- **Q6 — API keys.** A spec não define o formato da key nem o algoritmo do hash. Proponho deixar essa definição para a worktree `decision`, que é quem valida a key. O seed não cria nenhuma key. A worktree `decision` também pode querer uma coluna `key_prefix` para o console mostrar a key mascarada, o que exigiria mudar `packages/db`. Prefere que eu já inclua essa coluna agora, para evitar uma migration paralela depois?
- **Q7 — `.mcp.json`** está na raiz e não é rastreado. Coloco no `.gitignore` ou deixo como está?
- **Q8 — Imagem do Postgres.** A ideação prevê pgvector na fase 3. Proponho usar já a imagem `pgvector/pgvector:pg17` (Postgres 17 com a extensão disponível, mas sem ativá-la) no compose e no Testcontainers. Assim a fase 3 não precisa trocar a imagem. Ou prefere a `postgres:17-alpine` oficial agora?
