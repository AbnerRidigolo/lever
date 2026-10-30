# Plano — Spec 001, etapa `decision` (worktree de ordem 1)

| Campo    | Valor                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Spec     | `specs/001-plataforma-base/spec.md`                                                        |
| Etapa    | `decision` (seção 11, ordem 1)                                                             |
| Worktree | `../lever-decision`, branch `feat/decision`                                                |
| Status   | Aprovado pelo autor em 29/10/2026 (D1 a D9 aceitas)                                        |
| Escopo   | `services/decision`, mais os ajustes fora dele listados na seção 3 (precisam de aprovação) |

## 1. O que esta etapa entrega

O serviço de decisão (Node + Fastify) com:

- `GET /v1/config`: configuração completa de um ambiente, autenticada por API key (FR-005).
- `GET /v1/stream`: Server-Sent Events com o evento `config` na conexão e a cada mudança, e `ping` a cada 15 s (FR-006).
- `POST /v1/evaluate`: avaliação remota (FR-007). A rota, a validação e a montagem da resposta ficam prontas, mas o cálculo chama as funções reservadas ao autor.
- Propagação: escuta o canal `lever_config_changes` do Postgres (FR-008, já criado na etapa `base`) e recarrega a configuração do ambiente afetado.
- Cache em memória da configuração e das API keys, para continuar servindo se o Postgres cair (NFR-004).
- `/metrics` no formato do Prometheus (seção 10), traces com OpenTelemetry, logs com pino e `/healthz`.

**Fora desta etapa:** a lógica de atribuição e de avaliação de regras (do autor), o SDK, o console, o k6 (NFR-002) e o dashboard do Grafana (worktree `quality`).

## 2. Versões

Mesma regra da `base`: versão exata e com pelo menos 2 semanas de publicação (corte em 15/10/2026). Também valem as versões já usadas no monorepo: TypeScript 6.0.3, Zod 4.6.7, Vitest 5.0.5, pino 10.3.1 e drizzle-orm 0.45.4.

| Pacote                                  | Versão  | Uso                                                                              |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| fastify                                 | 5.12.7  | Servidor HTTP                                                                    |
| fastify-plugin                          | 6.0.1   | Plugins de autenticação e métricas sem isolamento de escopo                      |
| prom-client                             | 15.1.3  | `/metrics`                                                                       |
| @opentelemetry/api                      | 1.9.1   | API de traces                                                                    |
| @opentelemetry/sdk-node                 | 0.223.0 | SDK do OpenTelemetry                                                             |
| @opentelemetry/instrumentation-http     | 0.223.0 | Spans HTTP                                                                       |
| @opentelemetry/exporter-trace-otlp-http | 0.223.0 | Envio dos traces por OTLP                                                        |
| @fastify/otel                           | 0.21.2  | Spans por rota do Fastify (substitui o `instrumentation-fastify`, descontinuado) |
| @vitest/coverage-v8                     | 5.0.5   | Cobertura (NFR-005)                                                              |

A linha 0.300 do OpenTelemetry saiu depois do corte, então fico na 0.223.0, com todos os pacotes alinhados.

## 3. Decisões que preciso que você aprove

As decisões D3 e D4 mexem em arquivos fora de `services/decision`. Pelo AGENTS.md, preciso da sua autorização explícita.

- **D1 — Onde fica a avaliação, por causa da paridade com o SDK (AC-5.8).** O AGENTS.md reserva `services/decision/src/assignment/` e `src/evaluation/`. Só que o SDK, publicado no npm, não pode importar código de um serviço, e a AC-5.8 exige resultados idênticos nos dois. **Proposta:** nesta etapa, crio as assinaturas no caminho que o AGENTS.md define, e o serviço só as acessa por uma interface `Evaluator`, injetada no app. Antes da worktree `sdk`, você decide se o seu código vai para um pacote compartilhado (por exemplo `packages/evaluation`). Com a interface, essa mudança no serviço é de uma linha.
- **D2 — Assinaturas das funções reservadas.** Proposta, sujeita à sua mudança. Todas lançam `throw new Error('not implemented: reserved for author')`:
  ```ts
  // src/assignment/index.ts
  export function bucketOf(resourceKey: string, salt: string, userId: string): number; // 0..9999
  export function assignVariant(experiment: ExperimentConfig, userId: string): string; // variantKey
  // src/evaluation/index.ts
  export function matchesSegment(segment: SegmentConfig, user: UserContext): boolean;
  export function evaluateFlag(
    flag: FlagConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ): FlagValue;
  export function evaluateExperiment(
    experiment: ExperimentConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ): string;
  ```
- **D3 — Formato e hash das API keys** (pendente desde a Q6 da `base`). Proposta:
  - formato `lvr_<dev|prd>_<32 bytes aleatórios em base64url>`;
  - `key_prefix` com os primeiros 12 caracteres, para o console mostrar a key mascarada;
  - `key_hash` = SHA-256 em hex. A key tem 256 bits aleatórios, então um hash rápido basta e permite buscar pelo índice único.

  Console e decisão precisam do mesmo código, então **proponho colocar `generateApiKey()` e `hashApiKey()` em `packages/db/src/api-keys.ts`** (só servidor, usa `node:crypto`). Isso altera um pacote compartilhado, sem migration.

- **D4 — Outros arquivos fora do escopo:**
  - ativar o job `decision` (`host.docker.internal:4000`) em `infra/prometheus/prometheus.yml`, como a `base` deixou previsto;
  - adicionar `DECISION_PORT` e `OTEL_EXPORTER_OTLP_ENDPOINT` ao `.env.example` e ao README.
- **D5 — Revogação de key com Postgres no ar ou fora.** Cada key validada fica 30 s em cache (`API_KEY_CACHE_TTL_MS`). Ao expirar, o serviço consulta o banco de novo. Se o banco estiver fora, continua aceitando a key do cache e registra um aviso, para cumprir a NFR-004. Consequência: uma key revogada pode funcionar por até 30 s. Pode ser?
- **D6 — Testes das partes reservadas.** Escrevo os testes de AC-2.1 a 2.3, 3.2 a 3.5 e 4.3 a 4.4 a partir da spec em arquivos `*.author.test.ts`. Eles ficam fora do `pnpm test` (senão a CI quebraria até você implementar) e rodam com `pnpm --filter @lever/decision test:author`. Quando a sua implementação passar neles, eles entram no `pnpm test`.
- **D7 — Cobertura (NFR-005).** Meta de 80% com limite configurado no Vitest. `src/assignment/`, `src/evaluation/`, `src/main.ts`, `src/telemetry.ts` e `src/cli/` ficam fora da conta por enquanto. As duas primeiras voltam quando forem implementadas.
- **D8 — Traces.** O OpenTelemetry só exporta quando `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido. O compose ainda não tem Tempo nem um coletor; isso fica para a worktree `quality`.
- **D9 — API key para desenvolvimento.** O console ainda não existe, então crio o script `pnpm --filter @lever/decision api-key:create -- --env development --name local`. Ele grava a key no banco (só o hash) e mostra a key completa uma única vez (como a AC-7.3 pede para o console). Ele não altera o schema.

## 4. Regras de comportamento que vou implementar

São escolhas onde a spec não é explícita. Me corrija se alguma estiver errada.

- **Conteúdo de `/v1/config`:**
  - todas as flags do projeto. Uma flag sem linha em `flag_environments` sai desligada, com `servedValue` igual ao `defaultValue` e `rolloutBps = 0`;
  - todos os experimentos em qualquer estado, com o status do ambiente, porque o SDK precisa saber o controle (AC-3.5);
  - todos os segmentos do projeto;
  - `version` = maior `config_versions.version` do ambiente. Se o ambiente não tiver nenhuma versão publicada, responde 503 `service_unavailable`.
- **Validação de saída:** a configuração montada é validada com `environmentConfigSchema` antes de ir para o cache. Se for inválida, o serviço mantém a última válida e registra um erro.
- **Recarga:** cada notificação recarrega só o ambiente indicado e descarta versões menores ou iguais à que já está em cache. Quando o `LISTEN` reconecta, o serviço recarrega todos os ambientes em cache, para cobrir notificações perdidas.
- **Stream:**
  - na conexão, envia `event: config` com a configuração atual; depois, um `config` a cada nova versão e um `ping` a cada 15 s (configurável nos testes);
  - cabeçalhos `Content-Type: text/event-stream`, `Cache-Control: no-cache` e `X-Accel-Buffering: no`;
  - cada evento leva `id: <version>`.
- **`last_used_at`:** atualizado no máximo uma vez por minuto por key, sem bloquear a requisição.
- **Erros:** sempre no formato de `@lever/schemas/errors`:
  - 401 sem key ou com key inválida ou revogada;
  - 422 para corpo inválido;
  - 404 para rota desconhecida;
  - 500 sem detalhes internos;
  - 503 sem configuração disponível.
- **Logs:** o pino nunca registra o header `Authorization` nem a key, e não registra o `id` nem os atributos do usuário.

## 5. Tarefas e commits

Todas na branch `feat/decision`, em Conventional Commits.

| #   | Commit                                                           | Arquivos                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `docs: add decision worktree plan`                               | este arquivo                                                                                                                                                                                                                                                              |
| T2  | `feat(db): add api key generation and hashing helpers` (D3)      | `packages/db/src/api-keys.ts`, `packages/db/src/index.ts`, `packages/db/test/api-keys.test.ts`                                                                                                                                                                            |
| T3  | `feat(decision): scaffold fastify service`                       | `services/decision/{package.json,tsconfig*.json,eslint.config.js,vitest.config.ts}`, `src/env.ts`, `src/app.ts` (`buildApp(deps)`), `src/errors.ts` (erro padrão, handlers de 404 e de validação), `src/routes/health.ts`, `src/main.ts` (listen e desligamento gracioso) |
| T4  | `feat(decision): add reserved assignment and evaluation stubs`   | `src/assignment/index.ts`, `src/evaluation/index.ts` (D2), `src/evaluator.ts` (interface `Evaluator`, D1)                                                                                                                                                                 |
| T5  | `feat(decision): authenticate requests with api keys`            | `src/auth/api-key-store.ts` (cache com TTL e fallback), `src/auth/api-key-auth.ts` (preHandler `Bearer`)                                                                                                                                                                  |
| T6  | `feat(decision): serve environment config`                       | `src/config/load-config.ts` (Drizzle → `EnvironmentConfig`), `src/config/config-store.ts` (cache e eventos de atualização), `src/routes/config.ts`                                                                                                                        |
| T7  | `feat(decision): propagate config changes via listen/notify`     | `src/config/config-listener.ts` (`LISTEN lever_config_changes` e recarga ao reconectar)                                                                                                                                                                                   |
| T8  | `feat(decision): stream config updates over sse`                 | `src/routes/stream.ts`                                                                                                                                                                                                                                                    |
| T9  | `feat(decision): add remote evaluation endpoint`                 | `src/routes/evaluate.ts`                                                                                                                                                                                                                                                  |
| T10 | `feat(decision): expose prometheus metrics`                      | `src/metrics.ts`, `src/routes/metrics.ts`: requisições por rota, histograma de latência, clientes do stream, versão por ambiente e segundos desde a última atualização                                                                                                    |
| T11 | `feat(decision): instrument with opentelemetry`                  | `src/telemetry.ts` (D8)                                                                                                                                                                                                                                                   |
| T12 | `feat(decision): add api key creation script`                    | `src/cli/create-api-key.ts` (D9)                                                                                                                                                                                                                                          |
| T13 | `test(decision): add author tests for assignment and evaluation` | `test/author/*.author.test.ts`, script `test:author` (D6)                                                                                                                                                                                                                 |
| T14 | `chore(infra): scrape decision service metrics` (D4)             | `infra/prometheus/prometheus.yml`, `.env.example`, `README.md`, `services/decision/README.md`                                                                                                                                                                             |

Cada commit de T3 a T12 traz os próprios testes. A verificação final roda `install`, `lint`, `typecheck` e `test` com cobertura, sobe o serviço com `docker compose` e testa com `curl` usando uma key criada pelo script. Depois faço o push da branch e abro o PR para a `main`. Para abrir o PR com o `gh`, você precisa rodar `! gh auth login`; senão, deixo a branch no GitHub e o link para abrir o PR.

## 6. Testes

Integração com Postgres real via Testcontainers e o seed da `base`. O app sobe com `buildApp` e é testado com `app.inject`. O stream é testado com um servidor ouvindo numa porta e `fetch` lendo o corpo.

| Teste                   | O que verifica                                                                                                                                                                   | Cobre                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `config.test.ts`        | 200 com a configuração do seed, válida pelo schema. A key de `development` não recebe as configurações de `production`                                                           | FR-005, AC-1.3 (lado do servidor)                |
| `auth.test.ts`          | 401 sem header, com key malformada, inexistente ou revogada; `last_used_at` atualizado com limite de frequência                                                                  | FR-005, AC-7.3 (lado da decisão)                 |
| `propagation.test.ts`   | mudar a flag e publicar uma versão faz `/v1/config` refletir a mudança em menos de 5 s; notificações de versão antiga são ignoradas                                              | FR-008, AC-1.1/1.2 (servidor), NFR-003 (parcial) |
| `stream.test.ts`        | evento `config` inicial; novo `config` após publicar uma versão em menos de 5 s; `ping` no intervalo; métrica de clientes sobe e desce                                           | FR-006, AC-5.4 (servidor)                        |
| `resilience.test.ts`    | parar o contêiner do Postgres e continuar respondendo `/v1/config` e o stream com a última configuração e a key em cache                                                         | NFR-004                                          |
| `evaluate.test.ts`      | 401, 422 com detalhes, uso do `Evaluator` injetado (um avaliador falso **só no teste**) e formato da resposta                                                                    | FR-007                                           |
| `metrics.test.ts`       | `/metrics` expõe as métricas da seção 10                                                                                                                                         | seção 10                                         |
| `errors.test.ts`        | 404, 500 e 503 no formato padrão, sem vazar detalhes                                                                                                                             | AGENTS.md (erros)                                |
| `*.author.test.ts` (D6) | uniformidade 10% ±0,5 e 50/50 ±0,5 com 100.000 ids, monotonicidade do rollout, estabilidade, independência entre experimentos, só `running` atribui, segmento e atributo ausente | AC-2.1–2.3, AC-3.2–3.5, AC-4.3, AC-4.4           |

## 7. Requisitos que esta etapa **não** fecha

- **AC-1.1 e AC-1.2 completas:** dependem do console e da loja.
- **AC-5.x:** são do SDK.
- **AC-5.8 (paridade):** depende de D1.
- **NFR-002 (k6) e NFR-003 de ponta a ponta:** ficam para a worktree `quality`.
- **Dashboard do Grafana:** fica para a worktree `quality`.
