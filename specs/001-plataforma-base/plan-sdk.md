# Plano — Spec 001, etapa `sdk` (worktree de ordem 1)

| Campo    | Valor                                                                     |
| -------- | ------------------------------------------------------------------------- |
| Spec     | `specs/001-plataforma-base/spec.md`                                       |
| Etapa    | `sdk` (seção 11, ordem 1)                                                 |
| Worktree | `../lever-sdk`, branch `feat/sdk`                                         |
| Status   | Aprovado pelo autor em 03/11/2026 (D1 a D16 aceitas)                      |
| Escopo   | `packages/sdk`. Nenhum arquivo compartilhado muda sem aprovação (ver D16) |

## 1. O que esta etapa entrega

O pacote `@lever/sdk`, só para servidor (seção 13), que avalia flags e variantes localmente com a avaliação do autor em `@lever/evaluation` (decisão de 03/11/2026). O SDK chama `evaluateFlag`, `evaluateExperiment` e `matchesSegment`; não reimplementa nenhuma delas.

API pública proposta (tudo em exports nomeados de `src/index.ts`):

```ts
import type { ExposureEvent, FlagValueByType, UserContext } from '@lever/schemas';

export function createLeverClient(options: LeverClientOptions): LeverClient;

export interface LeverClientOptions {
  apiKey: string; // lvr_dev_... ou lvr_prd_... (validada com Zod; nunca vai para o log)
  baseUrl: string; // ex.: http://localhost:4000
  logger?: LeverLogger; // D9; um logger do pino serve sem adaptador
  backoff?: { initialDelayMs?: number; maxDelayMs?: number }; // D3
  heartbeatTimeoutMs?: number; // D4, padrão 45 000
}

export interface LeverClient {
  /** Resolve quando a primeira configuração válida chega, ou no timeout. Nunca rejeita (D2). */
  ready(options?: { timeoutMs?: number }): Promise<'ready' | 'timeout' | 'closed'>;
  /** AC-5.1. Sobrecargas por tipo: boolean, string, number e JSON (D7). Nunca lança. */
  getFlag(key: string, user: UserContext, defaultValue: boolean): boolean;
  getFlag(key: string, user: UserContext, defaultValue: string): string;
  getFlag(key: string, user: UserContext, defaultValue: number): number;
  getFlag<T extends FlagValueByType['json']>(key: string, user: UserContext, defaultValue: T): T;
  /** AC-5.2. Chave da variante, ou null sem configuração ou experimento desconhecido (D6). */
  getVariant(key: string, user: UserContext): string | null;
  /** AC-5.7. Registra um ouvinte de exposições; devolve a função que o remove (D10). */
  onExposure(listener: (event: ExposureEvent) => void): () => void;
  /** Seção 10: contadores e idade da configuração, para o app expor (D11). */
  getMetrics(): LeverClientMetrics;
  /** Fecha o stream e os timers. As avaliações seguem com a última configuração. */
  close(): Promise<void>;
}

export interface LeverClientMetrics {
  flagEvaluations: number; // contador monotônico
  experimentEvaluations: number; // contador monotônico
  evaluationErrors: number; // avaliador lançou exceção (D7)
  invalidMessages: number; // eventos do stream rejeitados pelo Zod (D8)
  reconnects: number;
  configVersion: number | null;
  configAgeMs: number | null; // D11
  connection: 'connecting' | 'connected' | 'disconnected' | 'unauthorized' | 'closed';
}

export interface LeverLogger {
  debug(fields: Record<string, unknown>, message: string): void;
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}
```

Por dentro:

- **Conexão:** um laço que abre `GET /v1/stream` com `fetch` do Node 24, lê o corpo com um parser de SSE próprio, valida cada evento com `streamEventSchema` e reconecta com backoff exponencial (D2 a D5).
- **Cache:** a configuração válida mais recente, com índices prontos (`Map` de flags, experimentos e segmentos), trocada por referência numa única atribuição. A avaliação não faz chamada de rede (AC-5.3).
- **Fallback:** sem configuração, `getFlag` devolve o padrão e `getVariant` devolve `null` (AC-5.5). Se o stream cair, a última configuração válida continua valendo (AC-5.6).
- **Exposições:** `onExposure` com eventos no formato de `exposureEventSchema` (AC-5.7).

**Fora desta etapa:** a lógica de avaliação (do autor), a paridade da AC-5.8 (worktree `quality`), o uso na loja e o `/metrics` da loja (worktree `store`), o SDK para navegador (seção 13) e a publicação no npm (D1).

## 2. Versões

Mesma regra das etapas anteriores: versão exata e com pelo menos 2 semanas de publicação (corte em 20/10/2026, conferido com `npm view <pacote> time --json` em 03/11/2026). O `pnpm-workspace.yaml` já impõe isso com `minimumReleaseAge`.

**Dependências de execução:** só `@lever/schemas` e `@lever/evaluation` (`workspace:*`). O Zod 4.6.7 chega por `@lever/schemas`. Nada de cliente de SSE, de logger ou de métricas:

- **HTTP:** `fetch` global do Node 24.
- **SSE:** parser próprio sobre `ReadableStream` + `TextDecoderStream` (umas 80 linhas, com testes). O `EventSource` do Node 24 ainda é experimental (fica atrás de `--experimental-eventsource`; `typeof EventSource` é `undefined` no Node 24.18 desta máquina) e não aceita o header `Authorization`. A alternativa pronta seria `eventsource-parser` 4.1.2 (12/10/2026, sem dependências); prefiro não adicionar nada.

**Dependências de desenvolvimento** (todas já usadas no monorepo):

| Pacote                     | Versão      | Uso                                                                  |
| -------------------------- | ----------- | -------------------------------------------------------------------- |
| typescript                 | 6.0.3       |                                                                      |
| vitest                     | 5.0.5       | Testes e `vitest bench` (NFR-001). A 5.1.0 é de 02/11, fora do corte |
| @vitest/coverage-v8        | 5.0.5       | Cobertura (NFR-005)                                                  |
| @types/node                | 24.19.2     |                                                                      |
| eslint                     | 10.12.0     |                                                                      |
| @testcontainers/postgresql | 12.2.1      | Postgres real no teste de contrato (D12)                             |
| @lever/config              | workspace:* | tsconfig e eslint                                                    |
| @lever/db                  | workspace:* | Migrations, seed e API key no teste de contrato (D12), sem alterar   |
| @lever/decision            | workspace:* | Só para o Turbo construir o serviço antes dos testes (D12)           |

**Só se o autor escolher publicar já (D1, opção B):** `tsdown` 0.23.1 (10/10/2026; a 0.23.2 é de 23/10, fora do corte) e `publint` 0.3.25 (01/10/2026).

## 3. Decisões que preciso que você aprove

- **D1 — Como `@lever/evaluation` e `@lever/schemas` (privados) entram num pacote "publicado no npm".**
  - **Proposta (opção A): não publicar nesta fase.** `@lever/sdk` fica `private: true`, compila com `tsc` como os outros pacotes e a loja o consome por `workspace:*`. Motivo: enquanto `@lever/evaluation` lança `not implemented`, um SDK publicado não avalia nada, e a spec 001 não tem critério de aceite de publicação.
  - **Quando publicar** (fim da fase 1 ou spec 005): empacotar `@lever/evaluation` e `@lever/schemas` dentro do `dist` com `tsdown`, incluindo os `.d.ts`, e deixar só `zod` como dependência. Assim os dois continuam privados e o que roda no SDK é exatamente o código do serviço (AC-5.8). Verificar o pacote com `publint`.
  - **Opção B:** fazer o empacotamento já nesta etapa, sem publicar.
  - **Opção C:** publicar os três pacotes no npm. Não recomendo: `@lever/schemas` vira API pública e qualquer mudança de contrato vira versão.
  - **Atenção:** `@lever/sdk` e `@lever/schemas` não existem no npm hoje (404), mas não consigo confirmar se a organização `@lever` está livre. Antes de publicar, você precisa registrar o escopo ou escolher outro nome.
- **D2 — Inicialização e comportamento antes da primeira configuração (AC-5.5).**
  - `createLeverClient` começa a conectar na hora e não bloqueia. `ready()` resolve com `'ready'` quando a primeira configuração válida chega, `'timeout'` depois de `timeoutMs` (padrão 5 s) e `'closed'` se o cliente for fechado. Nunca rejeita: o app sobe mesmo com o serviço de decisão fora do ar.
  - Até a primeira configuração: `getFlag` devolve o padrão informado, `getVariant` devolve `null` e nenhuma exposição é emitida.
  - **Canal:** proponho usar só o stream. O primeiro evento de `GET /v1/stream` já é a configuração completa, então `GET /v1/config` não é necessário e não há corrida entre os dois. A alternativa é buscar `/v1/config` primeiro e depois abrir o stream; é mais um caminho de código para o mesmo resultado.
- **D3 — Backoff exponencial (AC-5.5).**
  - Atraso base 500 ms, multiplicado por 2 a cada falha, com teto de 30 s. Jitter "igual": espera um valor aleatório entre metade e o atraso inteiro, para muitas instâncias não reconectarem juntas. Sequência típica: 0,25–0,5 s, 0,5–1 s, 1–2 s … até 15–30 s.
  - O contador volta a zero quando uma conexão entrega uma configuração válida.
  - Configurável em `backoff` (os testes usam atrasos curtos e relógio controlado).
  - **Quais falhas reconectam:** erro de rede, timeout, 429 e 5xx (inclusive o 503 de "sem configuração").
  - **Quais param:** 401, 403 e 404. Uma key inválida ou revogada não melhora sozinha. O SDK registra um erro, fica no estado `unauthorized`, mantém a última configuração (ou os padrões) e para de tentar até o app criar outro cliente.
- **D4 — Stream que cai depois de inicializado (AC-5.6).**
  - Fim do corpo, erro de leitura ou silêncio maior que `heartbeatTimeoutMs` (padrão 45 s, três pings de `STREAM_PING_INTERVAL_MS`) contam como queda. O SDK aborta a conexão e reconecta com o backoff da D3.
  - Durante a queda e depois dela, vale a última configuração válida. Ela nunca é apagada.
  - A versão só avança: uma configuração com `version` igual à atual é ignorada; menor, ignorada com aviso no log. **Limite conhecido:** se o banco de desenvolvimento for recriado e as versões recomeçarem do 1, o app precisa ser reiniciado.
- **D5 — Polling de `/v1/config` como rede de segurança.** **Proposta: não.** Toda reconexão do stream já entrega a configuração completa, e o heartbeat da D4 detecta stream mudo. Polling só ajudaria se um proxy bloqueasse SSE e deixasse GET passar, o que não acontece no ambiente local desta fase. Se precisar, entra depois como opção desligada por padrão.
- **D6 — O que `getVariant` devolve.**
  - Sem configuração ou com experimento desconhecido: **`null`**, com aviso no log uma vez por chave. A chave do controle não é conhecida sem configuração, e devolver um texto inventado esconderia o erro.
  - Experimento conhecido em qualquer estado: o resultado de `evaluateExperiment` do autor, que já devolve o controle fora de `running` e fora do segmento (AC-3.5, AC-4.3).
  - Alternativa: `getVariant(key, user, fallback)`, devolvendo `fallback` nos casos acima. Diga se prefere.
- **D7 — Regras de `getFlag`.**
  - Sobrecargas por tipo, para `getFlag('new-banner', user, false)` ter tipo `boolean`, e não `false`.
  - Chave desconhecida: devolve o padrão (aviso no log uma vez por chave).
  - Tipo do padrão diferente do tipo da flag (por exemplo, padrão `string` numa flag `boolean`): devolve o padrão e avisa uma vez por chave.
  - Se o avaliador do autor lançar exceção (hoje sempre lança `not implemented`), o SDK devolve o padrão, registra o erro e soma em `evaluationErrors`. `getFlag` e `getVariant` nunca lançam. No caso de `getVariant`, a exceção resulta em `null`.
- **D8 — Validação com Zod e mensagem inválida.**
  - `options` validadas em `createLeverClient`; opções inválidas lançam erro na hora (erro de programação, não de rede).
  - `user` validado com `userContextSchema` a cada chamada. Usuário inválido devolve o padrão (ou `null`) e avisa no log. O custo entra na medição da NFR-001.
  - Cada evento do stream: JSON e depois `streamEventSchema`, que inclui as verificações de `environmentConfigSchema` (chaves únicas, segmento existente, pesos). Evento inválido é descartado, a última configuração válida continua, o erro vai para o log (sem o conteúdo) e soma em `invalidMessages`. A conexão continua aberta. Evento com nome desconhecido é ignorado, para o servidor poder acrescentar eventos no futuro.
  - Respostas de erro do servidor são lidas com `apiErrorSchema` só para o log.
- **D9 — Logs sem impor o pino.**
  - Interface `LeverLogger` (`debug`, `info`, `warn`, `error`, cada um com `(fields, message)`). É a mesma assinatura do pino, então a loja passa o logger dela direto.
  - Sem logger informado: `warn` e `error` vão para `console.warn` e `console.error` como uma linha JSON, e `debug` e `info` são descartados. Assim um erro nunca some em silêncio.
  - O SDK nunca registra a API key, o `id` nem os atributos do usuário (AGENTS.md: logs sem dados pessoais). Avisos repetidos (chave desconhecida, tipo errado) saem uma vez por chave, com no máximo 1.000 chaves lembradas.
- **D10 — Exposições (AC-5.7).**
  - API: `client.onExposure(listener)` devolve a função que remove o ouvinte. Aceita vários ouvintes.
  - **Quando emitir:** em cada `getVariant` que avalia sem erro um experimento com `status = running` e com o usuário dentro do segmento (ou sem segmento). Para saber se o usuário está no segmento, o SDK chama `matchesSegment` do autor. Usuários fora do segmento ou experimentos fora de `running` recebem o controle, mas **não** geram exposição, porque não fazem parte do experimento e distorceriam a análise da spec 002. **Confirme essa interpretação de "cada atribuição de variante".**
  - Sem deduplicação nesta fase: a loja avalia a cada requisição, e deduplicar é papel do coletor (spec 002).
  - Evento: `{ type: 'exposure', experimentKey, variantKey, userId, configVersion, timestamp }`, tipado como `ExposureEvent`. Os campos já vêm validados (usuário e configuração), então ele não passa de novo pelo Zod em produção, para não pesar na NFR-001; os testes conferem cada evento com `exposureEventSchema`.
  - Ouvintes são chamados de forma síncrona, cada um em `try/catch`. Um ouvinte que lança não afeta o resultado nem os outros ouvintes; o erro vai para o log.
  - Sem ouvintes, o SDK registra a exposição em `debug`, **sem** o `userId`. O log completo da AC-5.7 fica com o ouvinte da loja.
- **D11 — Métricas para o app expor (seção 10).**
  - `getMetrics()` devolve uma foto com contadores monotônicos (`flagEvaluations`, `experimentEvaluations` e os demais) e o estado da conexão. "Avaliações por segundo" sai do contador com `rate()` no Prometheus, que é o jeito certo de medir taxa. O SDK não depende de `prom-client`; a loja cria as métricas e lê `getMetrics()` no `collect`.
  - **`configAgeMs`:** tempo desde a última vez em que o SDK teve certeza de que a configuração estava atual, isto é, desde o último `config` **ou** `ping` recebido. Com o stream saudável fica abaixo de 15 s; com o serviço fora do ar, cresce. Medir só desde a última versão recebida cresceria sem parar num ambiente sem mudanças, e o alarme não diria nada. `configVersion` acompanha. Sem configuração, os dois são `null`.
- **D12 — Testes contra o serviço de decisão real.** O AGENTS.md proíbe mock do banco, não da rede. Proposta em duas camadas:
  - **Servidor falso de decisão** (`test/fake-decision.ts`): um `node:http` de verdade, com sockets reais, que fala o contrato da seção 8 e monta as mensagens com `@lever/schemas`. Ele permite o que o serviço real não permite de forma determinística: ficar fora do ar, responder 401 ou 503, mandar evento inválido, derrubar o stream, ficar mudo. Cobre AC-5.3 a AC-5.7 e roda sem Docker.
  - **Teste de contrato com o serviço real** (`test/decision.contract.test.ts`): sobe `services/decision/dist/main.js` num processo filho (porta livre, `DATABASE_URL` de um Postgres do Testcontainers migrado e com o seed via `@lever/db`) e cria a API key com `generateApiKey` de `@lever/db`. Verifica: configuração do seed recebida; mudança publicada no banco chega ao SDK em menos de 5 s; serviço morto mantém a última configuração; SDK iniciado antes do serviço recebe a configuração quando ele sobe.
  - Por que processo filho e não `buildApp` no mesmo processo: `@lever/decision` não exporta nada (não tem `exports`), e importar o `src` de outro pacote acopla os dois. O processo filho usa o serviço como caixa-preta, sem mudar nenhum arquivo dele. `@lever/decision` entra como dependência de desenvolvimento só para o `^build` do Turbo construir o serviço antes de `pnpm test`.
  - Precisa de Docker, como os testes do serviço. A CI já tem; nesta máquina o Docker Desktop desliga uns 4 minutos depois de iniciar, então rodo esse arquivo logo depois de reiniciá-lo.
- **D13 — Como os testes passam enquanto `@lever/evaluation` lança `not implemented`.**
  - **O avaliador real é o padrão e o único da API pública.** `createLeverClient(options)` sempre usa `evaluateFlag`, `evaluateExperiment` e `matchesSegment` de `@lever/evaluation`. Não há opção pública para trocar o avaliador, porque isso quebraria a paridade da AC-5.8.
  - Por dentro, `createLeverClient` chama `createClient(options, deps)` de `src/client.ts`, com `deps = { evaluator, now, random }`. `createClient` **não** é exportado por `src/index.ts` (nem pelo `exports` do pacote); só os testes o importam pelo caminho do arquivo.
  - Os testes usam um `fakeEvaluator` igual ao do serviço (serve `servedValue` com a flag ligada, sempre o controle, todo usuário no segmento). Ele não implementa a lógica do autor.
  - Um teste da suíte normal garante a ligação: `defaultEvaluator.evaluateFlag === evaluateFlag` de `@lever/evaluation`, e o mesmo para as outras duas.
  - Testes com o avaliador real ficam em `test/author/*.author.test.ts`, fora do `pnpm test`, e rodam com `pnpm --filter @lever/sdk test:author` (mesmo esquema da D6 da etapa `decision`): AC-5.1 e AC-5.2 com o seed, exposição só em `running` e dentro do segmento, e a NFR-001 com a avaliação real. Quando a implementação existir, eles entram no `pnpm test`.
- **D14 — NFR-001 e NFR-005.**
  - `bench/evaluate.bench.ts` (`pnpm --filter @lever/sdk bench`) mede `getFlag` e `getVariant` com o Vitest bench e mostra o p99. O bench não falha por limite, então `test/latency.test.ts` mede 10.000 chamadas com `performance.now()` e exige p99 abaixo de 1 ms.
  - Hoje isso mede o custo do SDK (validação do usuário, busca no índice, métricas, exposição) com o avaliador falso. O número final, com a avaliação do autor, sai do `test:author` e é registrado no README pela `quality`.
  - Cobertura com limite de 80% no `vitest.config.ts` (linhas, funções, branches e statements), sem exclusões além de `bench/` e `test/`.
- **D15 — OpenTelemetry no SDK.** O AGENTS.md pede `/metrics` e OpenTelemetry em todo **serviço**; o SDK é biblioteca. **Proposta:** o SDK não depende de `@opentelemetry/*`. O `fetch` do Node é instrumentado pelo app (undici), o que já liga o trace do app ao serviço de decisão. As métricas saem por `getMetrics()` (D11).
- **D16 — Arquivos fora de `packages/sdk`.**
  - `packages/schemas` e `packages/evaluation`: **nenhuma mudança.** Os contratos de que preciso já existem (`environmentConfigSchema`, `streamEventSchema`, `exposureEventSchema`, `userContextSchema`, `apiErrorSchema`, `STREAM_PING_INTERVAL_MS`).
  - CI: **nenhuma mudança.** `pnpm test` já roda tudo pelo Turbo, e o runner tem Docker.
  - `pnpm-lock.yaml` muda por causa do pacote novo (inevitável).
  - README da raiz: **proposta** de uma seção curta "SDK" com o exemplo de uso e o link para `packages/sdk/README.md`. Só faço com a sua aprovação.

## 4. Regras de comportamento

São escolhas onde a spec não é explícita. Me corrija se alguma estiver errada.

- **Requisição do stream:** `GET {baseUrl}/v1/stream` com `Authorization: Bearer <key>` e `Accept: text/event-stream`. Status diferente de 200 ou `Content-Type` diferente de `text/event-stream` conta como falha (D3).
- **Parser de SSE:** segue o formato do WHATWG para o que o serviço usa: linhas terminadas em `\n`, `\r\n` ou `\r`; campos `event`, `data` (várias linhas juntadas com `\n`) e `id`; comentários (`:`) ignorados; espaço opcional depois dos dois-pontos; evento sem `event` vale `message` e é ignorado; eventos quebrados entre pedaços do corpo são remontados.
- **Aplicar configuração:** validar (D8), conferir a versão (D4), montar os índices (`Map` de flags, experimentos e segmentos) e trocar a referência. Uma avaliação em andamento usa a configuração inteira de antes ou de depois, nunca uma mistura.
- **Avaliação:** valida o usuário, busca a flag ou o experimento no índice, chama o avaliador com o `Map` de segmentos, soma o contador e, no caso de variante, emite a exposição (D10). Nenhuma chamada de rede (AC-5.3).
- **Ambiente:** o SDK não sabe nem precisa saber o ambiente; ele vem da API key (AC-1.3 é garantida pelo serviço).
- **`close()`:** aborta o `fetch`, limpa os timers e resolve os `ready()` pendentes com `'closed'`. É idempotente. As avaliações continuam com a última configuração; não há reconexão.
- **Vários clientes:** permitidos, cada um com a sua conexão. Na loja, a recomendação é um cliente por processo (worktree `store`).
- **Erros:** nenhuma exceção é engolida. Falhas de rede e de validação vão para o logger com contexto (status, tentativa, próximo atraso); exceções do avaliador e dos ouvintes também.

## 5. Tarefas e commits

Branch `feat/sdk`, Conventional Commits, sem atribuição a IA (sem `Co-Authored-By`).

| #   | Commit                                                       | Arquivos                                                                                                                                                           |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | `docs: add sdk worktree plan`                                | este arquivo                                                                                                                                                       |
| T2  | `feat(sdk): scaffold package`                                | `packages/sdk/{package.json,tsconfig.json,tsconfig.build.json,eslint.config.js,vitest.config.ts,vitest.author.config.ts}`, `src/index.ts`                          |
| T3  | `feat(sdk): add logger interface and options validation`     | `src/logger.ts` (D9), `src/options.ts` (schema Zod das opções e valores padrão), `test/options.test.ts`, `test/logger.test.ts`                                     |
| T4  | `feat(sdk): add server-sent events parser`                   | `src/sse.ts`, `test/sse.test.ts`                                                                                                                                   |
| T5  | `feat(sdk): add config cache with version guard`             | `src/config-cache.ts` (validação, índices, versão, idade), `test/config-cache.test.ts`                                                                             |
| T6  | `feat(sdk): connect to the decision stream with backoff`     | `src/backoff.ts` (D3), `src/connection.ts` (laço, heartbeat, 401), `test/fake-decision.ts`, `test/backoff.test.ts`, `test/startup.test.ts`, `test/stream.test.ts`  |
| T7  | `feat(sdk): evaluate flags and variants locally`             | `src/evaluator.ts` (interface e `defaultEvaluator`), `src/client.ts` (`createClient`, `createLeverClient`), `test/client.test.ts`, `test/local-evaluation.test.ts` |
| T8  | `feat(sdk): add exposure hook`                               | `src/exposure.ts` (D10), `test/exposure.test.ts`                                                                                                                   |
| T9  | `feat(sdk): expose client metrics`                           | `src/metrics.ts` (D11), `test/metrics.test.ts`                                                                                                                     |
| T10 | `test(sdk): add contract tests against the decision service` | `test/decision.contract.test.ts`, `test/decision-process.ts` (sobe e derruba o serviço), `test/global-setup.ts` (Testcontainers), `test/postgres-image.ts`         |
| T11 | `test(sdk): add evaluation latency benchmark`                | `bench/evaluate.bench.ts`, `test/latency.test.ts`, script `bench` (D14)                                                                                            |
| T12 | `test(sdk): add author tests for real evaluation`            | `test/author/*.author.test.ts`, script `test:author` (D13)                                                                                                         |
| T13 | `docs(sdk): document usage`                                  | `packages/sdk/README.md` (e a seção do README da raiz, se a D16 for aprovada)                                                                                      |

Cada commit de T3 a T9 traz os próprios testes. A verificação final roda `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm --filter @lever/sdk test` com cobertura (com Docker no ar para o teste de contrato), mais `test:author` para mostrar que os testes do autor falham só por `not implemented`. Depois faço o push e abro o PR para a `main`.

## 6. Testes

Vitest. A maior parte usa o servidor falso da D12 (rede real, sem Docker) e relógio controlado para backoff e heartbeat. O teste de contrato usa o serviço de decisão real e Postgres real via Testcontainers.

| Teste                           | O que verifica                                                                                                                                                                                                         | Cobre                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `options.test.ts`               | Key com formato inválido, `baseUrl` inválida e números fora da faixa lançam erro; padrões aplicados                                                                                                                    | AGENTS.md (Zod na fronteira)                  |
| `logger.test.ts`                | Logger padrão manda `warn`/`error` ao console; nenhum log contém a key, o `id` ou os atributos do usuário; aviso repetido sai uma vez por chave                                                                        | D9, AGENTS.md (logs)                          |
| `sse.test.ts`                   | `\n`, `\r\n` e `\r`; `data` em várias linhas; comentários; evento partido entre pedaços; evento sem nome ignorado                                                                                                      | FR-006 (lado do cliente)                      |
| `backoff.test.ts`               | Atrasos dobram até 30 s, jitter entre metade e o atraso, volta a zero depois de sucesso                                                                                                                                | AC-5.5                                        |
| `config-cache.test.ts`          | Só versões maiores entram; configuração inválida não substitui a válida; índices; idade da configuração                                                                                                                | AC-5.6, D4, D8, seção 10                      |
| `client.test.ts`                | `getFlag` devolve o valor ou o padrão; `getVariant` devolve a chave; chave desconhecida, tipo diferente, usuário inválido e exceção do avaliador; `defaultEvaluator` é o de `@lever/evaluation`                        | AC-5.1, AC-5.2, D6, D7, D13                   |
| `local-evaluation.test.ts`      | Depois de `ready()`, 10.000 avaliações não fazem nenhuma requisição ao servidor falso                                                                                                                                  | AC-5.3                                        |
| `stream.test.ts`                | Nova configuração pelo stream aplicada sem recriar o cliente; evento inválido descartado e conexão mantida; ping atualiza a idade; heartbeat vencido reconecta                                                         | AC-5.4, AC-5.6, D8, D4                        |
| `startup.test.ts`               | Servidor fora do ar: padrões, `null`, `ready()` com `'timeout'`, tentativas com backoff crescente e configuração aplicada quando o servidor sobe; 401 para de tentar; 503 reconecta                                    | AC-5.5, D2, D3                                |
| `resilience.test.ts`            | Stream derrubado depois de inicializado: avaliações seguem com a última configuração, reconexão e atualização depois dela                                                                                              | AC-5.6                                        |
| `exposure.test.ts`              | Ouvinte chamado a cada variante em `running` e dentro do segmento; não chamado fora de `running`, sem configuração ou com erro; evento válido por `exposureEventSchema`; ouvinte que lança isolado; remoção do ouvinte | AC-5.7, D10                                   |
| `metrics.test.ts`               | Contadores por tipo de avaliação, erros, mensagens inválidas, reconexões, versão, idade e estado da conexão                                                                                                            | seção 10, D11                                 |
| `decision.contract.test.ts`     | Serviço real: configuração do seed; mudança publicada no banco chega ao SDK em menos de 5 s; serviço morto mantém a configuração; SDK iniciado antes do serviço se conecta quando ele sobe                             | FR-005, FR-006, AC-5.4–5.6, NFR-003 (parcial) |
| `latency.test.ts` + bench       | p99 de `getFlag` e `getVariant` abaixo de 1 ms em 10.000 chamadas (custo do SDK com o avaliador falso)                                                                                                                 | NFR-001 (parcial)                             |
| `*.author.test.ts` (D13)        | Com a avaliação real e o seed: AC-5.1, AC-5.2, exposições só em `running` e no segmento e p99 abaixo de 1 ms                                                                                                           | AC-5.1, AC-5.2, AC-5.7, NFR-001               |
| Cobertura (`vitest --coverage`) | Limite de 80% em `src/`                                                                                                                                                                                                | NFR-005                                       |

## 7. Requisitos que esta etapa não fecha

- **AC-5.8 (paridade com 10.000 casos):** worktree `quality`, depois da implementação do autor.
- **AC-5.1, AC-5.2, AC-5.7 e NFR-001 com a avaliação real:** os testes ficam prontos em `test:author` e passam quando o autor implementar `@lever/evaluation`. Até lá, a suíte normal cobre o comportamento com o avaliador falso.
- **AC-1.1, AC-1.2 e NFR-003 de ponta a ponta (console → loja):** dependem da loja e ficam com as worktrees `store` e `quality`. Aqui fica a parte banco → decisão → SDK.
- **Métricas da seção 10 em `/metrics`:** o SDK as expõe por `getMetrics()`; quem publica no Prometheus é a loja.
- **Publicação no npm:** depende da D1.
- **SDK para navegador:** fora da fase 1 (seção 13).

## 8. Execução (03 e 04/11/2026)

Etapa concluída. Resultados:

- `pnpm lint`, `pnpm typecheck` e `pnpm test` na raiz passam. No `@lever/sdk`: 16 arquivos e 97 testes, contando os 4 do contrato com o serviço real.
- **Cobertura (NFR-005):** 98,07% de statements, 94,76% de branches, 100% de funções e 99,07% de linhas.
- **NFR-001 com o avaliador falso:** no `pnpm --filter @lever/sdk bench`, o p99 é de 0,003 ms em `getFlag` e 0,008 ms em `getVariant` com exposição. No `latency.test.ts`, com 10.000 chamadas, fica em cerca de 0,007 ms e 0,008 ms. O número com a avaliação real sai do `test:author` quando o autor implementar.
- **Contrato com o serviço real:** a mudança publicada no banco chegou ao SDK bem abaixo de 5 s.
- **`test:author`:** 5 dos 6 testes falham porque o SDK serve os padrões enquanto `@lever/evaluation` lança `not implemented`, como esperado. O de latência passa, mas só mede o caminho de erro.

Desvios em relação ao plano:

- **`zod` como dependência direta.** `options.ts` usa `z`, e o pnpm não deixa importar dependência transitiva. Mesma versão (4.6.7).
- **Benchmark no Vitest 5.** `bench` deixou de ser exportado de `vitest` e virou um recurso do contexto do teste (`async ({ bench }) => …`), que só roda com `vitest bench`. O `bench/evaluate.bench.ts` usa `bench.compare` e falha se o p99 passar de 1 ms. O script é `vitest bench --run --reporter=verbose`.
- **Arquivos de teste.** Os testes do laço de conexão ficaram em `connection.test.ts` e `startup.test.ts`; os do cliente, em `stream.test.ts`, `client-startup.test.ts` e `resilience.test.ts`. Também entraram `connection-helpers.ts`, `client-helpers.ts` (o `fakeEvaluator` e a fábrica de testes) e `fixtures.ts`.
- **Sem `global-setup.ts`.** O Postgres do Testcontainers sobe no `beforeAll` do próprio arquivo de contrato, para que os outros testes não precisem de Docker.
- **`ExposureHub` e `ClientCounters`.** São as classes de `exposure.ts` e `metrics.ts`. `parseStreamMessage` ficou em `config-cache.ts`.
- **Interface `Evaluator` com propriedades `readonly` de função**, e não métodos, para passar na regra `unbound-method` do ESLint.
- **Contagem de `evaluationErrors`.** Conta toda falha, inclusive de `matchesSegment` na decisão de exposição. O log sai uma vez por chave.
- **`ready()` com key rejeitada.** Com 401, 403 ou 404, `ready()` espera o próprio timeout, porque o resultado `'unauthorized'` não existe na API aprovada. O estado aparece em `getMetrics().connection`.
- **Ambiente local.** O Docker Desktop foi reiniciado uma vez, antes do teste de contrato, como combinado.
