# packages/sdk

SDK TypeScript do Lever (`@lever/sdk`), só para servidor nesta fase: avalia flags e variantes localmente, com cache, stream e fallback. Fase 1, worktree `sdk` da spec [001](../../specs/001-plataforma-base/spec.md); decisões no [plano da etapa](../../specs/001-plataforma-base/plan-sdk.md).

A avaliação vem de [`@lever/evaluation`](../evaluation/README.md), o mesmo código do serviço de decisão (AC-5.8). Enquanto o autor não a implementa, ela lança `not implemented`; o SDK registra o erro e devolve os valores padrão.

## Uso

```ts
import { createLeverClient } from '@lever/sdk';

const lever = createLeverClient({
  apiKey: process.env.LEVER_API_KEY!, // lvr_dev_... ou lvr_prd_...
  baseUrl: 'http://localhost:4000', // serviço de decisão
  logger, // opcional: um logger do pino serve direto
});

await lever.ready(); // 'ready', 'timeout' (5 s), 'closed' ou 'unauthorized' (key rejeitada); nunca rejeita

const user = { id: 'anon-123', attributes: { country: 'BR', device: 'mobile' } };
const showBanner = lever.getFlag('new-banner', user, false); // valor ou padrão
const layout = lever.getVariant('checkout-layout', user); // chave da variante ou null

const stop = lever.onExposure((event) => logger.info(event, 'exposure'));
const metrics = lever.getMetrics(); // contadores, versão e idade da configuração

await lever.close();
```

Crie **um cliente por processo**. Cada cliente mantém uma conexão com `GET /v1/stream`.

## Comportamento

- **Antes da primeira configuração** (ou com o serviço fora do ar): `getFlag` devolve o padrão, `getVariant` devolve `null` e nenhuma exposição é emitida.
- **Reconexão:** backoff exponencial de 500 ms até 30 s, com jitter. 401, 403 e 404 param as tentativas (key inválida ou revogada).
- **Stream caído ou mudo** (45 s sem dados): reconecta e mantém a última configuração válida. A versão só avança.
- **Mensagem inválida:** é descartada com erro no log; a configuração atual continua.
- **Nunca lança** em `getFlag` e `getVariant`. Chave desconhecida, tipo do padrão diferente do tipo da flag, usuário inválido ou erro da avaliação devolvem o padrão (ou `null`).
- **Exposições:** a cada `getVariant` de um experimento `running` com o usuário dentro do segmento. Sem ouvintes, só um log em `debug`, sem o id do usuário.
- **Logs:** nunca contêm a API key, o id nem os atributos do usuário.

## Métricas (seção 10 da spec)

`getMetrics()` devolve:

- `flagEvaluations`, `experimentEvaluations`, `evaluationErrors`, `invalidMessages` e `reconnects`: contadores que só crescem. Avaliações por segundo saem de `rate()` no Prometheus.
- `configVersion` e `configAgeMs` (tempo desde o último `config` ou `ping`).
- `connection`: `connecting`, `connected`, `disconnected`, `unauthorized` ou `closed`.

O app decide como expor; o SDK não depende de `prom-client`.

## Testes

```bash
pnpm --filter @lever/sdk test         # suíte com cobertura (limite de 80%)
pnpm --filter @lever/sdk bench        # NFR-001: latência da avaliação local
pnpm --filter @lever/sdk test:author  # com a avaliação real do autor
```

- A maior parte dos testes usa um servidor de decisão falso, com rede real, para simular falhas, e um avaliador falso injetado pela fábrica interna `createClient` (não exportada).
- `test/decision.contract.test.ts` sobe o serviço de decisão real (`services/decision/dist/main.js`) num processo filho, com Postgres do Testcontainers. Precisa de Docker.
- `test/author/` fica fora do `pnpm test` até `@lever/evaluation` ser implementado.

O pacote é `private` nesta fase; a publicação no npm fica para depois (D1 do plano).
