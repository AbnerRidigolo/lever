# Plano — Spec 002, etapa `collector` (worktree de ordem 1)

> **Para agentes:** use a skill `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o progresso.

| Campo      | Valor                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Spec       | `specs/002-eventos-e-lakehouse/spec.md` (aprovada em 27/11/2026)                                       |
| Etapa      | `collector` (seção 12, ordem 1)                                                                        |
| Status     | Rascunho (27/11/2026), aguardando aprovação do autor, principalmente das decisões D1 a D6              |
| Escopo     | `services/collector`, mais o que a D1 decidir sobre o código compartilhado com `services/decision`     |
| Depende de | `base-002` mesclada (AbnerRidigolo/lever#14): contratos de eventos, `.env.example` e o lakehouse local |

**Objetivo:** entregar o serviço de coleta da US-2: `POST /v1/events` autenticado pela API key, validação evento a evento, buffer limitado e escrita dos eventos aceitos na bronze, sem perder nenhum evento aceito quando o armazenamento cai e volta.

**Arquitetura:** um serviço Fastify no mesmo molde do `services/decision`. A rota valida e enriquece os eventos (ambiente e key vindos da autenticação, `receivedAt` do servidor) e os põe num buffer em memória. Um laço de envio grava os eventos no armazenamento S3 em lotes, um objeto por ambiente e por envio, com reenvio e backoff. Quando o buffer enche, a rota responde 503 com `Retry-After`.

**Stack:** Fastify 5.12.7, Zod 4.6.7, `@aws-sdk/client-s3` 3.1168.0, prom-client 15.1.3, OpenTelemetry (as mesmas versões do `services/decision`), Vitest 5.0.5 e Testcontainers (`@testcontainers/postgresql` e `testcontainers` 12.2.1).

## Restrições globais

- TypeScript estrito, sem `any`. Exports nomeados. Código, nomes e commits em inglês; README e plano em português (AGENTS.md).
- Os contratos vêm de `packages/schemas` e não mudam nesta etapa: `eventBatchSchema`, `collectorEventSchema`, `eventBatchResponseSchema`, `bronzeEventRecordSchema`, `EVENT_REJECTION_CODES`, `MAX_BATCH_EVENTS = 500`, `MAX_BATCH_BYTES = 524_288`, `MAX_EVENT_FUTURE_SKEW_MS = 300_000`, `MAX_EVENT_AGE_MS = 604_800_000`. Se faltar algo neles, pare e descreva a mudança (AGENTS.md, worktrees paralelas).
- Erros no formato de `packages/schemas/errors.ts`, com o mesmo tratamento do `services/decision` (`HttpError` e handlers).
- Logs com pino, sem dados pessoais: nunca o `userId` nem as propriedades dos eventos, e o cabeçalho `Authorization` sempre censurado.
- `/metrics` (Prometheus, prefixo `lever_collector_`) e OpenTelemetry, como todo serviço novo.
- Testes de integração com Postgres e SeaweedFS reais via Testcontainers, nunca mocks do banco. Os testes citam o ID com prefixo: `it('002/AC-2.2: ...')`.
- Cobertura acima de 80% em `services/collector` (NFR-006).
- Versões exatas e com pelo menos 2 semanas de publicação (corte: 13/11/2026).
- A deduplicação por `eventId` é da silver (FR-003, ADR-007). O coletor nunca deduplica.

## Foco da revisão

1. **Evento aceito e perdido.** Um evento que recebeu 202 tem que chegar à bronze mesmo que o armazenamento caia antes do envio. O envio só tira eventos do buffer depois da escrita confirmada, e o teste de integração derruba o SeaweedFS no meio (T5).
2. **Corpo malformado.** JSON inválido, `events` que não é array ou lote vazio respondem 400 no formato padrão, nunca 500 (T3).
3. **Ambiente vindo do corpo.** Um evento com um campo `environmentId` no corpo não pode mudar o ambiente do registro: o registro da bronze usa só o da autenticação (002/AC-2.4, T3).
4. **Desligamento com eventos no buffer.** No `SIGTERM`, o serviço para de aceitar, tenta enviar o que está no buffer por um tempo limitado e registra em log, com o número de eventos, o que não conseguiu enviar (T4).
5. **O mesmo `eventId` duas vezes.** Os dois são aceitos e gravados; a duplicata some na silver. Um teste documenta isso para ninguém "consertar" no coletor (T3).

---

## 1. Decisões que preciso que você aprove

- **D1 — Código compartilhado com o serviço de decisão.** O coletor precisa exatamente do que o `services/decision` já tem em `src/`:
  - `auth/` (`ApiKeyStore`, `requireApiKey`);
  - `errors.ts`, `timeout.ts` e `logger.ts`;
  - a rota de saúde e o plugin de métricas.

  Copiar esses arquivos duplicaria a parte mais sensível do sistema, a autenticação. **Proposta:**
  - criar `packages/service-kit` (`@lever/service-kit`) com esse código;
  - migrar o `services/decision` para importar de lá, sem mudar o comportamento (a suíte dele prova isso).

  Isso sai do escopo estrito da worktree (`services/collector`) e mexe no serviço de decisão, por isso pergunto. A alternativa é copiar agora e unificar depois, o que não recomendo.

- **D2 — O que o coletor grava na bronze.** Um serviço Node não escreve tabelas Iceberg com segurança. Não há biblioteca madura, e gravar via Trino criaria um commit por lote e uma dependência pesada na ingestão.

  **Proposta:**
  - O coletor grava os eventos aceitos como objetos NDJSON comprimidos (gzip) no S3, em `s3://lever-lake/bronze/events_raw/environment_id=<uuid>/received_date=<AAAA-MM-DD>/<timestamp>-<uuid>.ndjson.gz`. Cada linha é um `bronzeEventRecordSchema`, ou seja, o evento como foi aceito, com `receivedAt`, `environmentId` e `apiKeyId`.
  - A worktree `pipeline` registra esses arquivos na tabela Iceberg `bronze.events_raw`.
  - É o mesmo papel do Firehose na AWS, que grava arquivos no S3. Na fase 5, o destino troca por um Firehose sem mudar a rota.

  Isso cumpre o 002/AC-3.1: cru, particionado por ambiente e data de recebimento, e nunca alterado. Também deixa o registro no Iceberg para quem é dono das tabelas.

- **D3 — Durabilidade do buffer.** O 002/AC-2.6 pede um buffer limitado e "nenhum evento aceito com 202 se perde" quando o armazenamento cai e volta.

  **Proposta:** buffer em memória. Ele cobre esse cenário e o desligamento normal (T4). Se o processo morrer de forma abrupta (`kill -9`, falta de memória), os eventos no buffer se perdem, no máximo um intervalo de envio. Isso fica registrado no README como limite conhecido. Um spool em disco ou o Firehose (fase 5) resolve depois.

  A alternativa é gravar no disco antes de responder 202, com mais código e mais latência (NFR-001: p99 abaixo de 50 ms).

- **D4 — Sem limite de requisições nesta fase.** O contrato lista 429, e o SDK já trata 429 (002/AC-1.5), mas nenhum AC pede limite no coletor. **Proposta:** não implementar agora e deixar o 429 reservado no contrato.
- **D5 — Parâmetros do envio.** **Proposta** (todos configuráveis por variável de ambiente):

  | Parâmetro                      | Valor                                 | Variável                             |
  | ------------------------------ | ------------------------------------- | ------------------------------------ |
  | Intervalo entre envios         | 1 s                                   | `COLLECTOR_FLUSH_INTERVAL_MS=1000`   |
  | Máximo de eventos por objeto   | 5.000                                 | `COLLECTOR_FLUSH_MAX_EVENTS=5000`    |
  | Tamanho do buffer              | 100.000 eventos                       | `COLLECTOR_BUFFER_MAX_EVENTS=100000` |
  | `Retry-After` do 503           | 5 s                                   | —                                    |
  | Backoff dos reenvios           | 500 ms a 30 s, com variação aleatória | —                                    |
  | Tempo de envio no desligamento | 10 s                                  | `COLLECTOR_SHUTDOWN_FLUSH_MS=10000`  |

- **D6 — Porta e execução.**
  - Porta 4100, a mesma do exemplo de SDK da seção 10 da spec (`COLLECTOR_PORT=4100`).
  - Comando: `pnpm --filter @lever/collector dev`, com o perfil `lakehouse` do compose no ar.
  - O Prometheus ganha o alvo `collector`.

## 2. Arquivos

| Arquivo                                                                                                                         | Responsabilidade                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/service-kit/src/{api-key-store,api-key-auth,errors,timeout,logger,health,metrics-plugin,index}.ts` (+ testes movidos) | Código compartilhado (D1), extraído de `services/decision`                    |
| `services/decision/src/**`                                                                                                      | Passa a importar de `@lever/service-kit`; arquivos extraídos saem             |
| `services/collector/package.json`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`                                     | Pacote `@lever/collector`, no molde do `services/decision`                    |
| `services/collector/src/env.ts`                                                                                                 | `collectorEnvSchema` e `loadCollectorEnv()`                                   |
| `services/collector/src/app.ts`                                                                                                 | `buildApp(deps)`                                                              |
| `services/collector/src/routes/events.ts`                                                                                       | `POST /v1/events`                                                             |
| `services/collector/src/ingest.ts`                                                                                              | Valida um lote evento a evento e monta os registros da bronze (puro, sem I/O) |
| `services/collector/src/buffer.ts`                                                                                              | `EventBuffer`: fila limitada por ambiente                                     |
| `services/collector/src/flusher.ts`                                                                                             | `Flusher`: laço de envio, reenvio com backoff e envio no desligamento         |
| `services/collector/src/sink.ts`, `s3-sink.ts`                                                                                  | `BronzeSink` (interface) e a implementação S3                                 |
| `services/collector/src/metrics.ts`, `telemetry.ts`, `main.ts`, `logger.ts`                                                     | Métricas, traces, processo e logger                                           |
| `services/collector/test/**`                                                                                                    | Testes unitários, de rota e de integração                                     |
| `services/collector/README.md`, `.env.example`, `infra/prometheus/prometheus.yml`, `README.md` (raiz)                           | Documentação, variáveis e alvo do Prometheus                                  |

## 3. Tarefas

Cada tarefa vira um commit em Conventional Commits.

### T1 — `refactor: extract shared service kit from the decision service`

Só se a D1 for aprovada.

**Produz:** `@lever/service-kit`, exportando com os mesmos nomes e assinaturas de hoje:

- `ApiKeyStore`, `createDbApiKeySource`, `AuthenticatedKey` e `ApiKeySource`;
- `requireApiKey` e `authOf`;
- `HttpError` e `registerErrorHandlers`;
- `withTimeout`;
- `createLogger(service: string, level: string, destination?)` — o único parâmetro novo é o nome do serviço, que hoje está fixo em `'lever-decision'`;
- `healthRoutes`;
- `createHttpMetrics(registry, prefix)` e `metricsPlugin`, para que o prefixo das métricas venha de cada serviço.

- [ ] **Passo 1:** mover os arquivos e os testes unitários correspondentes de `services/decision` para `packages/service-kit`, no padrão de pacote de `packages/schemas` (build com `tsc` para `dist/`).
- [ ] **Passo 2:** trocar os imports no `services/decision`. Os nomes das métricas do serviço de decisão (`lever_decision_*`) não podem mudar, porque o dashboard `Lever / Decisão` depende deles.
- [ ] **Passo 3:** rodar `pnpm --filter @lever/service-kit test` e `pnpm --filter @lever/decision test`. Esperado: tudo passa, e a cobertura do `services/decision` continua acima de 80%.
- [ ] **Passo 4:** commit.

### T2 — `feat(collector): scaffold service with health, metrics and telemetry`

**Produz:**

- `collectorEnvSchema`, com estes campos:
  - `DATABASE_URL`, `COLLECTOR_HOST` (padrão `0.0.0.0`), `COLLECTOR_PORT` (padrão `4100`);
  - `LOG_LEVEL`, `API_KEY_CACHE_TTL_MS`;
  - `LAKE_S3_ENDPOINT`, `LAKE_S3_ACCESS_KEY`, `LAKE_S3_SECRET_KEY`, `LAKE_S3_REGION`, `LAKE_BUCKET`;
  - as quatro variáveis da D5;
  - `OTEL_EXPORTER_OTLP_ENDPOINT` (opcional) e `OTEL_SERVICE_NAME` (padrão `lever-collector`).
- `buildApp(deps: { logger; apiKeys; queue; metrics? })`.
- `/healthz`.
- `/metrics`, com `lever_collector_http_requests_total` e `lever_collector_http_request_duration_seconds`.

- [ ] **Passo 1: testes que falham.**
  - `env.test.ts`: os padrões; uma porta inválida falha e lista a variável.
  - `health.test.ts`: `GET /healthz` responde 200 `{ status: 'ok' }`.
  - `metrics.test.ts`: `GET /metrics` expõe `lever_collector_http_requests_total` depois de uma requisição.
- [ ] **Passo 2:** rodar `pnpm --filter @lever/collector test`. Esperado: FAIL, o pacote não existe.
- [ ] **Passo 3:** criar o pacote, `env.ts`, `app.ts`, `metrics.ts`, `logger.ts`, `telemetry.ts` e `main.ts`, no molde do `services/decision`. O `main.ts` só sobe o app nesta tarefa; o laço de envio entra na T4.
- [ ] **Passo 4:** rodar os testes, o typecheck e o lint. Esperado: tudo passa.
- [ ] **Passo 5:** commit.

### T3 — `feat(collector): accept event batches on POST /v1/events`

**Produz:**

- `ingestBatch(body: unknown, auth: AuthenticatedKey, receivedAt: Date): { records: BronzeEventRecord[]; rejected: EventRejection[] }` em `ingest.ts`, uma função pura;
- a rota, que autentica com `requireApiKey`, chama `ingestBatch`, põe os registros na fila (`queue.offer(records): boolean`) e responde 202 com `{ accepted, rejected }`;
- o limite de corpo do Fastify em `MAX_BATCH_BYTES`.

Esta tarefa define em `buffer.ts` só a interface `RecordQueue { offer(records: BronzeEventRecord[]): boolean }`, que a T4 implementa. Nos testes, uma fila falsa basta: `offer` aceita tudo ou recusa tudo.

- [ ] **Passo 1: testes que falham** (`ingest.test.ts` e `events-route.test.ts`, com Postgres real para as API keys, como no `services/decision`):
  - `002/AC-2.1: a valid batch with a valid key gets 202 and the accepted count`: 3 eventos válidos resultam em `{ accepted: 3, rejected: [] }`.
  - `002/AC-2.2: invalid events come back with index and code without dropping the batch`: com `[valid, {}, valid]`, a resposta é `accepted: 2` e `rejected: [{ index: 1, code: 'invalid_event', ... }]`.
  - `002/AC-2.3: missing, malformed or revoked keys get 401 in the standard format`, com o cabeçalho `www-authenticate: Bearer`.
  - `002/AC-2.4: the environment and key come from the API key, never from the body`: um evento com `environmentId` de outro ambiente no corpo gera um registro com o ambiente da key.
  - `002/AC-2.7: stamps receivedAt and rejects timestamps out of the window`:
    - um evento 6 minutos no futuro dá `timestamp_out_of_range`;
    - um evento de 8 dias atrás dá `timestamp_out_of_range`;
    - um evento 4 minutos no futuro é aceito, com `receivedAt` igual ao instante do servidor (relógio injetável).
  - `malformed bodies get 400, never 500`: JSON inválido, `{ events: 'x' }`, `{ events: [] }` e 501 eventos.
  - `bodies over 512 KB get 413`.
  - `the same eventId twice is accepted twice (deduplication is in the silver, FR-003)`.
  - `logs never carry the user id nor event properties`: um logger com destino em memória mostra que nenhuma linha contém o `userId` nem o valor de uma propriedade.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar `ingest.ts` e `routes/events.ts`. A janela de tempo usa as constantes de `@lever/schemas`.
- [ ] **Passo 4:** rodar os testes, o typecheck e o lint. Esperado: tudo passa.
- [ ] **Passo 5:** commit.

### T4 — `feat(collector): buffer accepted events and flush them to the bronze sink`

**Produz:**

- `interface BronzeSink { write(environmentId: string, records: BronzeEventRecord[]): Promise<void> }`.
- `EventBuffer implements RecordQueue`, com `offer(records): boolean`, `size()`, `peek(environmentId, max): BronzeEventRecord[]` e `commit(environmentId, count): void`:
  - `offer` aceita tudo ou nada: se não couber, recusa o lote inteiro.
  - `peek` não remove nada; os eventos só saem com `commit`, depois da escrita confirmada.
- `Flusher`, com `start()` e `stop(timeoutMs): Promise<{ unflushed: number }>`.
- A rota responde 503 com `Retry-After: 5` quando `offer` recusa.
- Métricas:
  - `lever_collector_events_total{type, outcome}`, com `outcome` em `accepted` ou `rejected` e um rótulo `reason` para as rejeições;
  - `lever_collector_batch_events` (histograma);
  - `lever_collector_buffer_events` (gauge);
  - `lever_collector_sink_write_duration_seconds` (histograma);
  - `lever_collector_sink_failures_total`.
- Um span OpenTelemetry por escrita no destino.

- [ ] **Passo 1: testes que falham**, com um destino falso em memória que pode falhar sob comando e relógio e timers controlados:
  - `002/AC-2.6: keeps accepted events while the sink is down and writes them when it returns`:
    - o destino falha 3 vezes e depois aceita;
    - todos os eventos são gravados exatamente uma vez, na ordem;
    - `lever_collector_sink_failures_total` vale 3.
  - `002/AC-2.6: a full buffer answers 503 with Retry-After and loses nothing already accepted`:
    - com o buffer de 10 eventos e 8 aceitos, um lote de 3 recebe 503 e `Retry-After: 5`;
    - os 8 continuam lá.
  - `flushes every interval or when an environment reaches the max events`.
  - `writes one object per environment per flush`.
  - `on stop, flushes what is buffered and reports what it could not write`:
    - com o destino fora, `stop(100)` devolve `{ unflushed: n }`;
    - uma linha de log de erro traz `n`.
  - `retries with exponential backoff capped at 30 s`, com valores injetáveis.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar `buffer.ts`, `flusher.ts` e `sink.ts`, e ligar no `app.ts` e no `main.ts`. O `main.ts` chama `flusher.stop(COLLECTOR_SHUTDOWN_FLUSH_MS)` no `SIGTERM` e no `SIGINT`, depois de fechar o app.
- [ ] **Passo 4:** rodar os testes, o typecheck e o lint. Esperado: tudo passa.
- [ ] **Passo 5:** commit.

### T5 — `feat(collector): write bronze objects to S3 and prove no loss against SeaweedFS`

**Produz:** `createS3Sink({ endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle: true, now }): BronzeSink`. Ele grava a chave da D2, com conteúdo NDJSON comprimido com gzip e `Content-Type: application/x-ndjson`.

- [ ] **Passo 1: testes que falham.** `s3-sink.test.ts` e `no-loss.test.ts` sobem `chrislusf/seaweedfs:4.53` com `testcontainers`, com `server -s3` e as credenciais fictícias do `.env.example`, e criam o bucket pelo SDK.
  - `002/AC-3.1: writes raw records partitioned by environment and received date`: lê o objeto de volta, descomprime e valida cada linha com `bronzeEventRecordSchema`. A chave casa com `bronze/events_raw/environment_id=<uuid>/received_date=2026-11-27/`.
  - `002/NFR-002: no event accepted with 202 is lost when the storage goes down and comes back`:
    1. sobe o app completo (Postgres + SeaweedFS reais);
    2. envia 50 eventos;
    3. para o contêiner do SeaweedFS;
    4. envia mais 50 (todos com 202);
    5. reinicia o contêiner;
    6. espera o envio;
    7. confere que os 100 `eventId` estão nos objetos.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar `s3-sink.ts`.
- [ ] **Passo 4:** rodar `pnpm --filter @lever/collector test`. Esperado: tudo passa, e a cobertura fica acima de 80% (NFR-006).
- [ ] **Passo 5:** commit.

### T6 — `docs(collector): document the collector and wire it into local infra`

- [ ] **README do serviço**, em português:
  - como subir;
  - as variáveis;
  - o formato dos objetos da bronze (D2);
  - o limite conhecido da D3;
  - as métricas.
- [ ] **`.env.example`:** as variáveis `COLLECTOR_*`, com os valores da D5 e da D6.
- [ ] **`infra/prometheus/prometheus.yml`:** o alvo `collector` em `host.docker.internal:4100`.
- [ ] **README da raiz:** o coletor na seção "Estado atual" e na tabela de endereços.
- [ ] Commit.

### T7 — Verificação final (sem commit, salvo correções)

- [ ] Rodar `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`. Esperado: tudo passa.
- [ ] **Teste manual:**
  1. subir o perfil `lakehouse` e o Postgres;
  2. criar uma key com `pnpm --filter @lever/decision api-key:create -- --env development --name collector`;
  3. enviar um lote com `curl`;
  4. ver o objeto no bucket.

  Registrar os comandos e a saída.

- [ ] Preencher a seção 5 deste plano.

## 4. Cobertura da spec nesta etapa

| Item da spec                                                 | Onde                         |
| ------------------------------------------------------------ | ---------------------------- |
| FR-002, 002/AC-2.1, 2.2, 2.3, 2.4, 2.7                       | T3                           |
| 002/AC-2.6, FR-003 (entrega pelo menos uma vez até a bronze) | T4, T5                       |
| 002/AC-3.1 (lado do coletor), NFR-002                        | T5                           |
| NFR-006 (coletor)                                            | T5                           |
| Seção 11, métricas e traces do coletor                       | T2, T4                       |
| 002/AC-2.5 (deduplicação na silver)                          | Fora: worktree `pipeline`    |
| NFR-001 (k6 do coletor)                                      | Fora: worktree `quality-002` |
| Lado do SDK (US-1)                                           | Fora: worktree `sdk-events`  |

## 5. Execução

A preencher na T7.
