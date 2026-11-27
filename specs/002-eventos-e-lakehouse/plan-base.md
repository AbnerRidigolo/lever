# Plano — Spec 002, etapa `base-002` (worktree de ordem 0)

> **Para agentes:** use a skill `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o progresso.

| Campo  | Valor                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec   | `specs/002-eventos-e-lakehouse/spec.md` (aprovada pelo autor em 27/11/2026)                                                                                   |
| Etapa  | `base-002` (seção 12, ordem 0)                                                                                                                                |
| Status | Rascunho (27/11/2026), aguardando aprovação do autor, principalmente das decisões D1 a D6                                                                     |
| Escopo | `packages/schemas`, `packages/db` (tabelas, migration 0004, seed), armazenamento S3, catálogo Iceberg e Trino no compose, `.env.example`, CI, README, ADR-006 |

**Objetivo:** deixar prontos os contratos, as tabelas e a infraestrutura local de que as worktrees de ordem 1 da spec 002 dependem.

**Arquitetura:** os contratos novos ficam em `packages/schemas`, em quatro arquivos: eventos, pedidos, métricas e análise. O banco ganha as tabelas da seção 7.1 numa única migration, gerada pelo drizzle-kit a partir dos schemas Drizzle. O compose ganha um armazenamento compatível com S3, um catálogo Iceberg REST e o Trino, verificados por um teste de fumaça que roda na CI.

**Stack:** Zod 4.6.7, Drizzle 0.45.4 e drizzle-kit 0.31.11, Vitest 5.0.5 com Testcontainers, Docker Compose, Trino e Iceberg.

## Restrições globais

- TypeScript estrito, sem `any`. Exports nomeados. Código, nomes e commits em inglês; spec, ADR e README em português (AGENTS.md).
- Os tipos vêm de `packages/schemas` via `z.infer`. O Drizzle importa os valores dos enums de lá, como faz `packages/db/src/schema/enums.ts`.
- Os testes novos citam o ID com o prefixo da spec: `it('002/AC-4.2: ...')` (AGENTS.md, regra 4).
- Versões exatas, sem `^`, e cada uma com pelo menos 2 semanas de publicação. Corte desta etapa: 13/11/2026.
- Só esta worktree cria migration até as worktrees de ordem 1 terminarem (spec, seção 12).
- Só valores fictícios no `.env.example` e nos arquivos de infra.
- Nada de estatística nem de lógica de pipeline aqui: só formas, tabelas e infraestrutura.

## Foco da revisão

Situações que a spec implica e que nenhuma tarefa cobriria sem cuidado. Cada uma tem um teste na tarefa dona do código.

1. **Um pedido cru passando por limpo.** Se `cleanOrderSchema` aceitar campos extras, um pedido com `customer.name` passa para a silver. Ele é `z.strictObject`, testado na T1.
2. **Estatísticas incoerentes vindas da gold.** Numa conversão, y vale 0 ou 1, então `sumY` precisa ser igual a `sumY2` e no máximo `n`. Um erro de SQL que quebre isso deve falhar na fronteira, não virar um p-valor errado (T2).
3. **Lote com um evento quebrado.** O container do lote não pode validar os eventos, senão um evento inválido derruba o lote inteiro e viola o 002/AC-2.2. O lote é `z.array(z.unknown())`, e cada evento é validado à parte (T1).
4. **Métrica apagada com experimento usando.** A chave estrangeira de `experiment_metrics.metric_id` é `RESTRICT` (002/AC-4.4), testada no Postgres real (T3).
5. **Catálogo perdendo as tabelas ao reiniciar.** O catálogo REST de teste guarda o estado em memória por padrão. O teste de fumaça reinicia o contêiner e confere que a tabela continua lá (T5).

---

## 1. Decisões que preciso que você aprove

- **D1 — O MinIO saiu do Docker Hub; proposta: SeaweedFS.** A spec e a ADR-006 dizem MinIO, mas o repositório `minio/minio` não existe mais no Docker Hub (consulta de 27/11/2026), porque o MinIO parou de publicar imagens da edição comunitária. Comparei três substitutos compatíveis com S3:
  - **SeaweedFS** `chrislusf/seaweedfs:4.53` (08/11/2026, Apache-2.0). Maduro e com um único binário (`weed server -s3`). **É a minha escolha.**
  - RustFS `1.0.5` (10/11/2026). Ainda está na 1.0.
  - Garage `v2.5.0` (24/10/2026). Exige configurar layout e chaves por CLI antes do primeiro uso.

  Se você aprovar, a T5 troca "MinIO" por "SeaweedFS" na spec (escopo do `base-002`, Q2 e ADR-006). A troca não muda nenhum contrato, porque todos falam S3.

- **D2 — Versões das outras imagens:** Trino `trinodb/trino:484` (16/10/2026) e catálogo `apache/iceberg-rest-fixture:1.10.1` (22/12/2025). A tag `latest` do catálogo é de 11/11, mas não tem número de versão, então fico na 1.10.1.
- **D3 — Persistência do catálogo.** A imagem `iceberg-rest-fixture` é feita para testes e guarda o catálogo em memória. **Proposta:** apontar o catálogo JDBC dela para um arquivo SQLite num volume (`CATALOG_URI=jdbc:sqlite:file:/data/catalog.db`). Assim as tabelas sobrevivem a um reinício, e o teste de fumaça prova isso. Se não funcionar, paro e te aviso antes de trocar de catálogo (Lakekeeper ou Polaris).
- **D4 — UF no pedido.** A Q6 reduz o endereço à UF, mas o checkout da loja hoje só tem `name`, `address` (texto livre) e `city` (`apps/store/src/server/checkout.ts`). **Proposta:** o contrato do pedido para o ETL exige `address: { street, city, state }`, com `state` numa das 27 UFs, e a worktree `store-002` adiciona um campo de UF ao checkout.
- **D5 — MDE absoluto ou relativo.** O 002/AC-5.1 aceita os dois, mas a seção 7.1 só tem a coluna `mde`. **Proposta:** adicionar `mde_kind` (`absolute` ou `relative`) ao lado de `mde`.
- **D6 — Métricas de proteção do seed.** A Q9 decidiu "taxa de erro de checkout" e "tempo até a compra", e as duas esbarram na spec:
  - **Erro de checkout** precisa de um evento `checkout_error`, que não está na lista do 002/AC-10.1. **Proposta:** a T4 acrescenta `checkout_error` ao 002/AC-10.1 e o seed cria a métrica `checkout-error-rate` (`conversion`, direção `decrease`).
  - **Tempo até a compra** não cabe nos tipos do 002/AC-4.1. O tipo `mean` conta zero para quem não comprou, e isso puxa a média para baixo sem medir tempo nenhum. **Proposta:** deixar essa métrica fora do seed e registrá-la como questão para uma spec futura, que pode criar um tipo de média só entre quem fez o evento. A alternativa seria criar esse tipo já nesta spec, o que mexe na estatística do autor.

## 2. Arquivos

| Arquivo                                                                                                                        | Responsabilidade                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `packages/schemas/src/events.ts` (+ `.test.ts`)                                                                                | Eventos do SDK para o coletor, lote, resposta e registro da bronze                                      |
| `packages/schemas/src/orders.ts` (+ `.test.ts`)                                                                                | Pedido para o ETL (cru) e pedido limpo da silver                                                        |
| `packages/schemas/src/metrics.ts` (+ `.test.ts`)                                                                               | Métricas, papéis no experimento e plano amostral                                                        |
| `packages/schemas/src/analysis.ts` (+ `.test.ts`)                                                                              | Estatísticas suficientes, resultados, SRM e constantes da análise                                       |
| `packages/schemas/src/audit.ts`, `index.ts`                                                                                    | `metric` em `AUDIT_RESOURCE_TYPES`; exports novos                                                       |
| `packages/db/src/schema/enums.ts`                                                                                              | Enums novos (tipo, direção e papel da métrica, `mde_kind`, status da análise, método, status do pedido) |
| `packages/db/src/schema/metrics.ts`                                                                                            | `metrics`, `experiment_metrics`                                                                         |
| `packages/db/src/schema/experiments.ts`                                                                                        | Colunas do plano amostral em `experiments`                                                              |
| `packages/db/src/schema/analysis.ts`                                                                                           | `analysis_runs`, `experiment_results`, `srm_checks`                                                     |
| `packages/db/src/schema/store-orders.ts`                                                                                       | `store_orders`                                                                                          |
| `packages/db/src/schema/relations.ts`, `index.ts`                                                                              | Relações e exports                                                                                      |
| `packages/db/migrations/0004_*.sql` (+ `meta/`)                                                                                | Gerada pelo drizzle-kit                                                                                 |
| `packages/db/test/metrics.test.ts`, `analysis.test.ts`, `store-orders.test.ts`                                                 | Testes de integração das tabelas novas                                                                  |
| `packages/db/test/migrations.test.ts`, `seed.test.ts`                                                                          | Atualizados para as tabelas e o seed novos                                                              |
| `packages/db/src/seed/data.ts`, `index.ts`                                                                                     | Métricas do demo e plano do `checkout-layout`                                                           |
| `infra/docker-compose.yml`                                                                                                     | `seaweedfs`, `lakehouse-init`, `iceberg-rest`, `trino`                                                  |
| `infra/trino/catalog/lake.properties`                                                                                          | Catálogo `lake` do Trino (Iceberg REST + S3)                                                            |
| `infra/seaweedfs/s3.json`                                                                                                      | Identidade S3 local com as credenciais fictícias do `.env.example` (se a imagem não aceitar variáveis)  |
| `infra/lakehouse/smoke.sh`                                                                                                     | Teste de fumaça do lakehouse                                                                            |
| `.github/workflows/ci.yml`                                                                                                     | Job `Lakehouse smoke`                                                                                   |
| `.env.example`, `README.md`, `docs/adr/0006-lakehouse-local.md`, `docs/adr/README.md`, `specs/002-eventos-e-lakehouse/spec.md` | Variáveis, serviços, ADR e a troca do MinIO (D1)                                                        |

## 3. Tarefas

Cada tarefa vira um commit em Conventional Commits.

### T1 — `feat(schemas): add event and order contracts for phase 2`

**Arquivos:** criar `packages/schemas/src/events.ts`, `events.test.ts`, `orders.ts`, `orders.test.ts`; alterar `index.ts`.

**Interfaces produzidas** (usadas por `collector`, `sdk-events`, `pipeline` e `store-002`):

- `EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/`, `eventNameSchema`
- `eventPropertiesSchema`: `Record<string, string | number | boolean>`, no máximo `MAX_EVENT_PROPERTIES = 32` chaves, número finito, string de até `MAX_EVENT_PROPERTY_STRING = 1024` caracteres (escolha minha, a spec não fixa)
- `sdkInfoSchema = { name: z.literal('@lever/sdk'), version: string 1..32 }`
- `collectorExposureEventSchema = exposureEventSchema.extend({ eventId: z.uuid(), sdk: sdkInfoSchema })`; o `exposureEventSchema` da spec 001 não muda
- `trackEventSchema = { type: 'track', eventId, name, userId (1..256), timestamp (ISO com fuso), properties (padrão {}), sdk }`
- `collectorEventSchema = z.discriminatedUnion('type', [collectorExposureEventSchema, trackEventSchema])`, tipo `CollectorEvent`
- `MAX_BATCH_EVENTS = 500`, `MAX_BATCH_BYTES = 524_288`, `eventBatchSchema = { events: z.array(z.unknown()).min(1).max(500) }`
- `EVENT_REJECTION_CODES = ['invalid_event', 'timestamp_out_of_range']`, `eventBatchResponseSchema = { accepted: int ≥ 0, rejected: [{ index: int ≥ 0, code, message }] }`
- `MAX_EVENT_FUTURE_SKEW_MS = 300_000`, `MAX_EVENT_AGE_MS = 604_800_000` (002/AC-2.7)
- `bronzeEventRecordSchema = { event: collectorEventSchema, receivedAt: ISO, environmentId: uuid, apiKeyId: uuid }`
- `BRAZILIAN_STATES` (as 27 UFs), `brazilianStateSchema`
- `etlOrderSchema = { orderId: string 1..64, userId: string 1..256, placedAt: ISO, items: [{ productId: string, quantity: int ≥ 1, unitPriceCents: int ≥ 0 }] (≥ 1), totalCents: int ≥ 0, customer: { name: string 1..120, address: { street, city, state } } }`
- `cleanOrderSchema = z.strictObject({ orderId, userId, placedAt, items, totalCents, state })`

- [ ] **Passo 1: escrever os testes que falham** em `events.test.ts` e `orders.test.ts`:
  - `002/AC-1.7: accepts snake_case event names and rejects others`: `purchase` e `add_to_cart` passam; `Purchase`, `1abc`, `add-to-cart`, `''` e `'a'.repeat(65)` falham.
  - `002/AC-1.7: rejects nested, array and non-finite property values`: `{ a: { b: 1 } }`, `{ a: [1] }`, `{ a: NaN }` e `{ a: Infinity }` falham; 32 chaves passam e 33 falham.
  - `002/AC-1.4: requires a uuid eventId on every collector event`: um `track` sem `eventId` ou com `eventId: 'abc'` falha.
  - `002/AC-1.2: extends the spec 001 exposure without changing the hook event`: uma exposição da spec 001 sem `eventId` ainda passa em `exposureEventSchema` e falha em `collectorExposureEventSchema`; com `eventId` e `sdk`, passa no segundo.
  - `002/AC-2.2: the batch container never validates individual events`: `eventBatchSchema.parse({ events: [{}, validTrack] })` passa; depois, `collectorEventSchema.safeParse` falha para `{}` e passa para `validTrack`.
  - `002/AC-2.1: limits a batch to 1 to 500 events`: 0 e 501 eventos falham; 1 e 500 passam.
  - `002/AC-2.7: fixes the accepted timestamp window`: `MAX_EVENT_FUTURE_SKEW_MS === 300_000` e `MAX_EVENT_AGE_MS === 604_800_000`.
  - `002/AC-2.4: a bronze record carries the environment and key from the server`: `bronzeEventRecordSchema` exige `environmentId` e `apiKeyId` como UUID.
  - `002/AC-3.4: a raw order never passes as a clean order`: `cleanOrderSchema.safeParse(rawOrder).success === false`; o pedido limpo com `state: 'SP'` passa.
  - `002/AC-3.4: accepts only the 27 Brazilian states`: `SP` e `DF` passam; `XX` e `sp` falham.
  - `etl order requires at least one item with positive quantity`: `items: []`, `quantity: 0` e `totalCents: -1` falham.
- [ ] **Passo 2: rodar e ver falhar.** Comando: `pnpm --filter @lever/schemas test`. Esperado: FAIL, módulos `./events.js` e `./orders.js` não existem.
- [ ] **Passo 3: implementar** `events.ts` e `orders.ts` com as interfaces acima, e exportar os dois em `index.ts`.
- [ ] **Passo 4: rodar e ver passar.** Comando: `pnpm --filter @lever/schemas test && pnpm --filter @lever/schemas typecheck`. Esperado: PASS.
- [ ] **Passo 5: commit.**

### T2 — `feat(schemas): add metric, experiment plan and analysis contracts`

**Arquivos:** criar `metrics.ts`, `metrics.test.ts`, `analysis.ts`, `analysis.test.ts`; alterar `audit.ts`, `index.ts` e o teste de auditoria, se ele listar os tipos.

**Interfaces produzidas** (usadas por `console-002`, `stats`, `analysis` e `pipeline`):

- `METRIC_TYPES = ['conversion', 'mean', 'ratio']`, `METRIC_DIRECTIONS = ['increase', 'decrease']`, `METRIC_ROLES = ['primary', 'secondary', 'guardrail']`
- `metricDefinitionSchema = z.discriminatedUnion('type', [...])`, com campos comuns `{ key: resourceKeySchema, name: string 1..120, direction, eventName }`:
  - `conversion`: só os campos comuns;
  - `mean`: mais `valueProperty`, um nome de propriedade de 1 a 64 caracteres;
  - `ratio`: mais `denominatorEventName`, que segue o padrão de nome de evento.
- `MAX_SECONDARY_METRICS = 10`, `experimentMetricsSchema = [{ metricKey, role }]`: exatamente uma `primary`, até 10 `secondary`, `guardrail` sem limite e chaves únicas (002/AC-4.2)
- `MDE_KINDS = ['absolute', 'relative']`, `DEFAULT_ALPHA = 0.05`, `DEFAULT_POWER = 0.8`
- `experimentPlanSchema = { plannedSampleSize: int ≥ 1 | null, mde: { kind, value > 0 } | null, alpha: 0.001..0.2 (padrão 0,05), power: 0.5..0.99 (padrão 0,8) }`. Os limites de `alpha` e `power` são escolha minha.
- `SRM_P_VALUE_THRESHOLD = 0.001`, `CUPED_PRE_PERIOD_DAYS = 14`, `GUARDRAIL_DEFAULT_ALPHA = 0.05`
- `meanStatsSchema = { kind: 'mean', n: int ≥ 0, sumY, sumY2 ≥ 0, cuped: { sumX, sumX2 ≥ 0, sumXY } | null }`
- `ratioStatsSchema = { kind: 'ratio', n, sumNum, sumNum2 ≥ 0, sumDen, sumDen2 ≥ 0, sumNumDen }`
- `variantStatsSchema = { experimentKey, variantKey, metricKey, metricType, stats }`, com `superRefine`:
  - `ratio` exige `kind: 'ratio'`, e os outros tipos exigem `kind: 'mean'`;
  - `conversion` exige `sumY === sumY2` e `sumY <= n`.
- `srmInputSchema = { variants: [{ variantKey, users: int ≥ 0, weightBps }] }`, com pesos somando 10.000
- `ANALYSIS_RUN_STATUSES = ['running', 'succeeded', 'failed']`, `RESULT_METHODS = ['z_test_proportions', 'welch_t_test', 'delta_method']` (seção 8.3; o autor pode trocar)
- `experimentResultSchema = { metricKey, variantKey, users, value, deltaAbs, deltaRel, ciLow, ciHigh, pValue, pValueAdjusted, cuped: boolean, method }`
  - Os campos de efeito são anuláveis, porque a linha do controle não tem efeito.
  - Quando há intervalo, `ciLow <= ciHigh`; os p-valores ficam entre 0 e 1.
- `srmCheckSchema = { observed: Record<variantKey, int>, expected: Record<variantKey, number>, pValue: 0..1, excludedUsers: int ≥ 0 }`
- `AUDIT_RESOURCE_TYPES` ganha `'metric'`

- [ ] **Passo 1: escrever os testes que falham:**
  - `002/AC-4.1: each metric type requires its own fields`: `mean` sem `valueProperty` falha; `ratio` sem `denominatorEventName` falha; `conversion` com só os campos comuns passa.
  - `002/AC-4.2: exactly one primary, up to 10 secondary, any guardrails, unique keys`: zero ou duas `primary` falham; 11 `secondary` falham e 10 passam; 20 `guardrail` passam; chave repetida falha.
  - `002/AC-5.4: experiment plan defaults alpha and power`: `experimentPlanSchema.parse({ plannedSampleSize: 14_748, mde: { kind: 'absolute', value: 0.01 } })` resulta em `alpha 0.05` e `power 0.8`; `alpha: 0`, `alpha: 0.25` e `mde.value: 0` falham.
  - `002/AC-7.2: SRM threshold is 0.001` e `002/AC-8.1: CUPED pre-period is 14 days`: valores das constantes.
  - `rejects incoherent conversion statistics from the gold`: `{ metricType: 'conversion', stats: { kind: 'mean', n: 10, sumY: 11, sumY2: 11, cuped: null } }` falha; `sumY: 3, sumY2: 4` falha; `sumY: 3, sumY2: 3` passa.
  - `ratio metrics need ratio statistics`: `metricType: 'ratio'` com `kind: 'mean'` falha.
  - `002/AC-7.1: SRM input weights sum to 10,000 bps`: 5.000 + 4.000 falha.
  - `002/AC-6.1: control rows carry no effect, intervals are ordered`: linha com `deltaAbs: null` (controle) passa; `ciLow: 0.2, ciHigh: 0.1` falha; `pValue: 1.2` falha.
  - `002/AC-4.4: metric changes are audited`: `AUDIT_RESOURCE_TYPES` contém `'metric'`.
- [ ] **Passo 2: rodar e ver falhar.** Comando: `pnpm --filter @lever/schemas test`. Esperado: FAIL.
- [ ] **Passo 3: implementar** `metrics.ts`, `analysis.ts` e a mudança em `audit.ts`.
- [ ] **Passo 4: rodar e ver passar.** Comando: `pnpm --filter @lever/schemas test && pnpm --filter @lever/schemas typecheck`. Esperado: PASS.
- [ ] **Passo 5: commit.**

### T3 — `feat(db): add phase 2 tables and migration`

**Arquivos:** criar `packages/db/src/schema/metrics.ts`, `analysis.ts`, `store-orders.ts`, `packages/db/test/metrics.test.ts`, `analysis.test.ts` e `store-orders.test.ts`; alterar `enums.ts`, `experiments.ts`, `relations.ts`, `index.ts` e `test/migrations.test.ts`; gerar `migrations/0004_*`.

**Consome:** as constantes da T1 e da T2 (`METRIC_TYPES`, `METRIC_DIRECTIONS`, `METRIC_ROLES`, `MDE_KINDS`, `ANALYSIS_RUN_STATUSES`, `RESULT_METHODS`, `STORE_ORDER_STATUSES = ['pending_etl', 'loaded']`; esta última entra em `orders.ts` nesta tarefa).

**Tabelas** (convenções de `columns.ts`: `id()` e `timestamps()` em todas):

- `metrics`:
  - Colunas: `project_id` (FK com `cascade`), `key`, `name`, `type`, `event_name`, `value_property` (anulável), `denominator_event_name` (anulável), `direction`.
  - Única em `(project_id, key)`.
  - `CHECK metrics_fields_by_type`: `(type <> 'mean' OR value_property IS NOT NULL) AND (type <> 'ratio' OR denominator_event_name IS NOT NULL)`.
- `experiment_metrics`:
  - Colunas: `experiment_id` (FK com `cascade`), `metric_id` (FK com `restrict`), `role`.
  - Única em `(experiment_id, metric_id)`; índice único parcial em `experiment_id WHERE role = 'primary'`.
- `experiments` (colunas novas):
  - `planned_sample_size` (integer, anulável), `mde_kind` (anulável), `mde` (double, anulável), `alpha` (double, padrão 0,05), `power` (double, padrão 0,8).
  - CHECKs: `alpha` entre 0,001 e 0,2; `power` entre 0,5 e 0,99; `mde > 0`; `mde` e `mde_kind` ou os dois nulos ou os dois preenchidos.
- `analysis_runs`:
  - Colunas: `environment_id` (FK com `cascade`), `started_at`, `finished_at` (anulável), `status`, `data_through` (anulável), `error` (anulável).
  - Índice em `(environment_id, started_at)`.
- `experiment_results`:
  - Colunas: `analysis_run_id` (FK com `cascade`), `experiment_id` (FK com `cascade`), `environment_id` (FK com `cascade`), `metric_id` (FK com `restrict`), `variant_key`, `users`, `value`, `delta_abs`, `delta_rel`, `ci_low`, `ci_high`, `p_value`, `p_value_adjusted`, `cuped`, `method`. Os campos de efeito são anuláveis.
  - Única em `(analysis_run_id, experiment_id, metric_id, variant_key, cuped)`.
- `srm_checks`:
  - Colunas: `analysis_run_id` (FK com `cascade`), `experiment_id`, `environment_id`, `observed` (jsonb), `expected` (jsonb), `p_value`, `excluded_users`.
  - Única em `(analysis_run_id, experiment_id)`.
- `store_orders`:
  - Colunas: `order_id` (único), `user_id`, `items` (jsonb), `total_cents` (`CHECK >= 0`), `customer_name`, `address` (jsonb), `status` (padrão `pending_etl`), `placed_at`.
  - Índice parcial em `placed_at WHERE status = 'pending_etl'`.

- [ ] **Passo 1: escrever os testes que falham.** Usar `useTestDb`, `createTestProject` e os códigos `PG_*` de `test/helpers.ts`, como em `constraints.test.ts`.
  - `metrics.test.ts`:
    - `002/AC-4.1: metric keys are unique per project`: a mesma chave no mesmo projeto dá `PG_UNIQUE_VIOLATION`; em outro projeto, passa.
    - `002/AC-4.1: a mean metric needs a value property`: dá `PG_CHECK_VIOLATION`.
    - `002/AC-4.2: an experiment has at most one primary metric`: dá `PG_UNIQUE_VIOLATION`.
    - `002/AC-4.4: a metric used by an experiment cannot be deleted`: dá `PG_FOREIGN_KEY_VIOLATION`.
    - `002/AC-4.4: audit_log accepts metric changes`: um insert com `resource_type: 'metric'` passa.
    - `002/AC-5.4: experiments default alpha 0.05 and power 0.8 and reject alpha 0`: confere os padrões; `alpha: 0` dá `PG_CHECK_VIOLATION`.
  - `analysis.test.ts`:
    - `002/FR-009: one result row per run, experiment, metric, variant and adjustment`: uma linha duplicada dá `PG_UNIQUE_VIOLATION`; a mesma chave com `cuped` diferente passa.
    - `deleting an analysis run removes its results and SRM checks`.
  - `store-orders.test.ts`:
    - `002/AC-3.4: order ids are unique`: dá `PG_UNIQUE_VIOLATION`.
    - `002/AC-10.2: new orders wait for the ETL`: o status padrão é `pending_etl`.
    - `rejects a negative total`: dá `PG_CHECK_VIOLATION`.
  - `migrations.test.ts`:
    - A lista de tabelas ganha `analysis_runs`, `experiment_metrics`, `experiment_results`, `metrics`, `srm_checks` e `store_orders`, em ordem alfabética.
    - A contagem de tabelas com `id`, `created_at` e `updated_at` passa de 13 para 19.
- [ ] **Passo 2: rodar e ver falhar.** Comando: `pnpm --filter @lever/db test`. Esperado: FAIL, as tabelas não existem.
- [ ] **Passo 3: escrever os schemas Drizzle** com as tabelas acima, mais as relações e os exports.
- [ ] **Passo 4: gerar a migration.** Comando: `pnpm --filter @lever/db db:generate -- --name phase2_metrics_analysis_orders`. Esperado: um arquivo `0004_phase2_metrics_analysis_orders.sql` com `ALTER TYPE "audit_resource_type" ADD VALUE 'metric'`, as tabelas, os índices e os CHECKs. Revisar o SQL antes de seguir.
- [ ] **Passo 5: rodar e ver passar.** Comando: `pnpm --filter @lever/db test && pnpm --filter @lever/db typecheck`. Esperado: PASS, inclusive os testes da spec 001.
- [ ] **Passo 6: commit.**

### T4 — `feat(db): seed demo metrics and checkout-layout plan`

**Arquivos:** alterar `packages/db/src/seed/data.ts`, `seed/index.ts`, `test/seed.test.ts` e, se D6 for aprovada, o 002/AC-10.1 na spec.

**Dados** (ids fixos na faixa `00000000-0000-4000-8000-00000000006x`, validados pelos schemas da T2):

| Métrica               | Tipo         | Evento                         | Direção    | Papel no `checkout-layout`   |
| --------------------- | ------------ | ------------------------------ | ---------- | ---------------------------- |
| `checkout-conversion` | `conversion` | `purchase`                     | `increase` | `primary`                    |
| `revenue-per-user`    | `mean`       | `purchase.revenueCents`        | `increase` | `secondary`                  |
| `add-to-cart-rate`    | `ratio`      | `add_to_cart` ÷ `product_view` | `increase` | `secondary`                  |
| `checkout-error-rate` | `conversion` | `checkout_error`               | `decrease` | `guardrail` (se D6 aprovada) |

Plano do `checkout-layout`: `plannedSampleSize: 14_748`, `mde: { kind: 'absolute', value: 0.01 }` (o caso de referência do 002/AC-5.1), `alpha` e `power` padrão. Cada métrica criada também gera um registro de auditoria, como o seed já faz com a flag e o experimento.

- [ ] **Passo 1: escrever os testes que falham** em `seed.test.ts`:
  - `002/AC-4.1 (data): creates the demo metrics`: as chaves, os tipos e as direções da tabela acima.
  - `002/AC-4.2 (data): checkout-layout has one primary metric`: o resultado passa em `experimentMetricsSchema` e a `primary` é `checkout-conversion`.
  - `002/AC-5.4 (data): checkout-layout plans 14,748 users per variant`.
  - `002/AC-4.4 (data): records the creation of each seeded metric`.
  - O teste de idempotência que já existe passa a contar as tabelas novas.
- [ ] **Passo 2: rodar e ver falhar.** Comando: `pnpm --filter @lever/db test -- seed`. Esperado: FAIL.
- [ ] **Passo 3: implementar** os dados e as inserções com `onConflictDoNothing`, como o seed atual.
- [ ] **Passo 4: rodar e ver passar.** Comando: `pnpm --filter @lever/db test`. Esperado: PASS, inclusive "is idempotent".
- [ ] **Passo 5: commit.**

### T5 — `feat(infra): add local lakehouse with seaweedfs, iceberg rest and trino`

**Arquivos:** alterar `infra/docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `README.md`, `docs/adr/README.md` e a spec (D1); criar `infra/trino/catalog/lake.properties`, `infra/lakehouse/smoke.sh`, `docs/adr/0006-lakehouse-local.md` e, se preciso, `infra/seaweedfs/s3.json`.

**Produz** (usado por `collector`, `pipeline` e `analysis`):

- **Variáveis:** `LAKE_S3_PORT=8333`, `LAKE_S3_ENDPOINT=http://localhost:8333`, `LAKE_S3_ACCESS_KEY=lever-local-access-key`, `LAKE_S3_SECRET_KEY=lever-local-secret-key`, `LAKE_S3_REGION=us-east-1`, `LAKE_BUCKET=lever-lake`, `ICEBERG_REST_PORT=8181`, `TRINO_PORT=8080`.
- **Serviços:**
  - `seaweedfs`: S3 na porta 8333, dados num volume.
  - `lakehouse-init`: serviço avulso que cria o bucket `lever-lake` (com `weed shell`, comando `s3.bucket.create`) e termina.
  - `iceberg-rest`:
    - Warehouse em `s3://lever-lake/warehouse`, catálogo em SQLite num volume (D3).
    - Usa `S3FileIO` com endpoint `http://seaweedfs:8333` e acesso por caminho (_path-style_).
  - `trino`: catálogo `lake` em `/etc/trino/catalog/lake.properties`.
    - Conector `iceberg` com `iceberg.catalog.type=rest` e `fs.native-s3.enabled=true`.
    - S3 com acesso por caminho, e credenciais lidas com `${ENV:LAKE_S3_ACCESS_KEY}`.
- **Fumaça:** `infra/lakehouse/smoke.sh`.
  1. Sobe os quatro serviços com `docker compose up -d --wait`.
  2. Pelo `trino` CLI do contêiner, cria o schema `lake.smoke`, cria uma tabela, insere uma linha e confere `count(*) = 1`.
  3. Reinicia o `iceberg-rest` e confere `count(*) = 1` de novo, o que prova a D3.
  4. Apaga o schema e sai com código diferente de zero em qualquer divergência.

- [ ] **Passo 1: escrever o `smoke.sh`** com `set -euo pipefail` e as verificações acima.
- [ ] **Passo 2: rodar e ver falhar.** Comando: `bash infra/lakehouse/smoke.sh`. Esperado: falha, porque os serviços não existem no compose.
- [ ] **Passo 3: adicionar os serviços**, o `lake.properties` e as variáveis no `.env.example`, com os comentários no estilo do compose atual.
- [ ] **Passo 4: rodar e ver passar.** Comando: `cp -n .env.example .env; bash infra/lakehouse/smoke.sh`. Esperado: termina com código 0 e imprime as duas contagens iguais a 1.
- [ ] **Passo 5: CI.** Adicionar o job `Lakehouse smoke` ao `ci.yml`, que roda `cp .env.example .env && bash infra/lakehouse/smoke.sh` no runner do Ubuntu, com timeout de 15 minutos.
- [ ] **Passo 6: documentação.**
  - README: os serviços novos na tabela de endereços e uma linha sobre o `smoke.sh`.
  - ADR-006: lakehouse local, com o motivo, a correspondência com a AWS (SeaweedFS para S3, Iceberg REST para Glue, Trino para Athena), a troca do MinIO e o que muda na 005.
  - Índice dos ADRs atualizado.
  - Na spec, "MinIO" vira "SeaweedFS" no escopo do `base-002`, na Q2 e na ADR-006, com uma nota sobre a D1.
- [ ] **Passo 7: commit.**

### T6 — Verificação final (sem commit, salvo correções)

- [ ] Rodar `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`. Esperado: tudo passa.
- [ ] Rodar `bash infra/lakehouse/smoke.sh` de novo, do zero (`docker compose down -v` antes). Esperado: código 0.
- [ ] Preencher a seção 5 deste plano com o que foi feito, os desvios e o que ficou de fora.

## 4. Cobertura da spec nesta etapa

Esta etapa só entrega contratos, tabelas e infraestrutura. Os AC são cobertos nas suas partes de dados ou de formato, e o comportamento fica com as worktrees de ordem 1.

| Item da spec                                                  | Onde                      |
| ------------------------------------------------------------- | ------------------------- |
| Seção 10 (contratos), FR-001, FR-002                          | T1                        |
| 002/AC-1.2, 1.4, 1.7, 2.1, 2.2, 2.4, 2.7 (formato)            | T1                        |
| 002/AC-3.4, Q5, Q6, D4 (pedido)                               | T1, T3                    |
| Seção 8.2, 002/AC-4.1, 4.2, 5.4, 6.1, 7.1, 7.2, 8.1 (formato) | T2                        |
| Seção 7.1, FR-007, FR-009 (tabelas), 002/AC-4.4               | T3                        |
| Seed de métricas e plano do `checkout-layout`                 | T4                        |
| FR-006 (infraestrutura), ADR-006, Q2                          | T5                        |
| Seção 7.2 (tabelas Iceberg)                                   | Fora: worktree `pipeline` |
| Assinaturas de `packages/stats`                               | Fora: worktree `stats`    |

## 5. Execução

A preencher na T6.
