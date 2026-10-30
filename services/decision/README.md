# services/decision

Serviço de decisão do Lever (Node + Fastify). Entrega a configuração de flags e experimentos de um ambiente, transmite as mudanças em tempo real e faz avaliação remota. Spec: [001 — Plataforma base](../../specs/001-plataforma-base/spec.md). Plano: [`plan-decision.md`](../../specs/001-plataforma-base/plan-decision.md).

## Rotas

| Rota                | Autenticação       | O que faz                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `GET /v1/config`    | `Bearer <api key>` | Configuração completa do ambiente da key (FR-005)                                          |
| `GET /v1/stream`    | `Bearer <api key>` | Server-Sent Events: `config` ao conectar e a cada nova versão, `ping` a cada 15 s (FR-006) |
| `POST /v1/evaluate` | `Bearer <api key>` | Avaliação remota de flags e experimentos para um usuário (FR-007)                          |
| `GET /metrics`      | —                  | Métricas no formato do Prometheus                                                          |
| `GET /healthz`      | —                  | Liveness; não depende do Postgres                                                          |

Todos os erros seguem o formato de `@lever/schemas` (`{ error: { code, message, details?, requestId? } }`).

## Como rodar

Com o banco no ar, migrado e com o seed (veja o README da raiz):

```bash
pnpm build                                                    # compila os pacotes compartilhados
pnpm --filter @lever/decision api-key:create -- --env development
pnpm --filter @lever/decision dev                             # http://localhost:4000

curl -H "Authorization: Bearer <key>" http://localhost:4000/v1/config
curl -N -H "Authorization: Bearer <key>" http://localhost:4000/v1/stream
```

O script `api-key:create` grava só o hash da key e mostra a key completa uma única vez. Ele existe até o console assumir a criação de keys (AC-7.3).

Variáveis de ambiente (lidas do `.env` da raiz): `DATABASE_URL`, `DECISION_HOST`, `DECISION_PORT`, `LOG_LEVEL`, `API_KEY_CACHE_TTL_MS`, `OTEL_EXPORTER_OTLP_ENDPOINT` e `OTEL_SERVICE_NAME`.

## Como funciona

- **Configuração:** carregada do Postgres no primeiro uso de cada ambiente, num snapshot só de leitura, e validada com `environmentConfigSchema` antes de entrar no cache. O cache nunca volta para uma versão mais antiga.
- **Propagação (FR-008):** o serviço escuta o canal `lever_config_changes`, que o trigger de `config_versions` notifica, e recarrega só o ambiente afetado. Depois de uma reconexão, recarrega todos.
- **Postgres fora do ar (NFR-004):** a configuração e as keys já conhecidas continuam sendo servidas da memória. Uma key em cache é revalidada em segundo plano depois de `API_KEY_CACHE_TTL_MS`, então uma key revogada deixa de funcionar em até 30 s, mais uma requisição. Uma key desconhecida espera no máximo 2 s pelo banco e então recebe 503.
- **Avaliação:** o serviço usa a interface `Evaluator` (`src/evaluator.ts`). A implementação fica em `src/assignment/` e `src/evaluation/`, **reservadas ao autor**, que hoje lançam `not implemented`.

## Testes

```bash
pnpm --filter @lever/decision test          # integração com Postgres real (Testcontainers) e cobertura
pnpm --filter @lever/decision test:author   # testes da spec para as partes reservadas ao autor
```

`test:author` cobre FR-004, AC-2.1 a 2.3, AC-3.2 a 3.5 e AC-4.1 a 4.4. Ele fica fora do `pnpm test` até a implementação do autor existir. Quando todos passarem, mova os arquivos para a suíte principal e tire `src/assignment` e `src/evaluation` da exclusão de cobertura em `vitest.config.ts`.
