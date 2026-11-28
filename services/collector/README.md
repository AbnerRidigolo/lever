# services/collector

Coletor de eventos do Lever (Node + Fastify). Recebe lotes de eventos do SDK, valida cada evento, responde `202` e grava os aceitos na camada bronze do lakehouse. Spec: [002 — Eventos e lakehouse](../../specs/002-eventos-e-lakehouse/spec.md). Plano: [`plan-collector.md`](../../specs/002-eventos-e-lakehouse/plan-collector.md).

O coletor nunca deduplica: o mesmo `eventId` enviado duas vezes é aceito e gravado duas vezes. A deduplicação por `eventId` é da silver (FR-003, ADR-007).

## Rotas

| Rota              | Autenticação       | O que faz                                                  |
| ----------------- | ------------------ | ---------------------------------------------------------- |
| `POST /v1/events` | `Bearer <api key>` | Recebe um lote de 1 a 500 eventos (veja o contrato abaixo) |
| `GET /metrics`    | —                  | Métricas no formato do Prometheus                          |
| `GET /healthz`    | —                  | Liveness; não depende do Postgres nem do S3                |

Todos os erros seguem o formato de `@lever/schemas` (`{ error: { code, message, details?, requestId? } }`).

## Como rodar

Precisa do Postgres (com migrations e seed) e do lakehouse, que fica no profile `lakehouse` do compose (veja o README da raiz):

```bash
docker compose --profile lakehouse up -d
pnpm db:migrate && pnpm db:seed
pnpm build                                                      # compila os pacotes compartilhados
pnpm --filter @lever/decision api-key:create -- --env development --name collector
pnpm --filter @lever/collector dev                              # http://localhost:4100
```

O script `api-key:create` grava só o hash da key e mostra a key completa uma única vez. A key vale para o ambiente em que foi criada, e é esse ambiente que vai para a bronze.

## Variáveis de ambiente

Lidas do `.env` da raiz (`.env.example` tem os valores locais). Todas têm valor padrão, exceto `DATABASE_URL` (obrigatória) e `OTEL_EXPORTER_OTLP_ENDPOINT` (opcional: sem ela, os traces não são exportados).

| Variável                          | Padrão                   | O que controla                                                                           |
| --------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | — (obrigatória)          | Postgres, usado só para validar as API keys                                              |
| `COLLECTOR_HOST`                  | `0.0.0.0`                | Endereço de escuta                                                                       |
| `COLLECTOR_PORT`                  | `4100`                   | Porta                                                                                    |
| `LOG_LEVEL`                       | `info`                   | Nível do log (`fatal` a `trace`, ou `silent`)                                            |
| `API_KEY_CACHE_TTL_MS`            | `30000`                  | Por quanto tempo uma key validada é confiável antes de ser conferida de novo             |
| `LAKE_S3_ENDPOINT`                | `http://localhost:8333`  | S3 do lakehouse (SeaweedFS local)                                                        |
| `LAKE_S3_ACCESS_KEY`              | `lever-local-access-key` | Credencial do S3                                                                         |
| `LAKE_S3_SECRET_KEY`              | `lever-local-secret-key` | Credencial do S3                                                                         |
| `LAKE_S3_REGION`                  | `us-east-1`              | Região do S3                                                                             |
| `LAKE_BUCKET`                     | `lever-lake`             | Bucket da bronze                                                                         |
| `COLLECTOR_FLUSH_INTERVAL_MS`     | `1000`                   | Intervalo entre envios ao S3                                                             |
| `COLLECTOR_FLUSH_MAX_EVENTS`      | `5000`                   | Máximo de eventos por objeto; um ambiente que chega a esse número é enviado na hora      |
| `COLLECTOR_BUFFER_MAX_EVENTS`     | `100000`                 | Tamanho do buffer em memória, somando todos os ambientes                                 |
| `COLLECTOR_SHUTDOWN_FLUSH_MS`     | `10000`                  | Tempo máximo para enviar o buffer no desligamento                                        |
| `COLLECTOR_SINK_WRITE_TIMEOUT_MS` | `10000`                  | Tempo máximo de uma escrita no S3; passado isso, ela é abandonada e reenviada com espera |
| `OTEL_EXPORTER_OTLP_ENDPOINT`     | — (traces desligados)    | Os traces só são exportados quando esta variável existe                                  |
| `OTEL_SERVICE_NAME`               | `lever-collector`        | Nome do serviço nos traces                                                               |

## Contrato de `POST /v1/events`

```bash
curl -i -X POST http://localhost:4100/v1/events \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "track",
        "eventId": "0b9f6f0e-6a1c-4d3b-9a43-1c1f6d7a2e10",
        "name": "checkout_completed",
        "userId": "anon-123",
        "timestamp": "'"$(date -u +%FT%TZ)"'",
        "properties": { "total": 129.9, "coupon": false },
        "sdk": { "name": "@lever/sdk", "version": "0.1.0" }
      }
    ]
  }'
```

Resposta `202`:

```json
{ "accepted": 1, "rejected": [] }
```

Cada evento é validado sozinho: um evento inválido não derruba o lote. Os rejeitados voltam em `rejected`, com o `index` do evento no lote, e os demais são aceitos:

```json
{
  "accepted": 1,
  "rejected": [
    { "index": 1, "code": "invalid_event", "message": "eventId: Invalid UUID" },
    {
      "index": 2,
      "code": "timestamp_out_of_range",
      "message": "timestamp must be at most 5 minutes ahead and at most 7 days old"
    }
  ]
}
```

| Status | Quando                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202`  | O lote foi lido. Os eventos aceitos estão no buffer; os rejeitados vêm em `rejected`. Um lote com todos os eventos rejeitados também responde `202`. |
| `400`  | Corpo que não é JSON válido, sem `events`, com `events` que não é array, vazio ou com mais de 500 eventos (`code: bad_request`).                     |
| `401`  | `Authorization` ausente, fora do formato `Bearer <key>`, ou key inválida ou revogada (`code: unauthorized`).                                         |
| `413`  | Corpo acima de 524.288 bytes. Usa `code: bad_request`, porque ainda não existe um código de payload grande demais.                                   |
| `503`  | O buffer está cheio. O lote inteiro é recusado, com `Retry-After: 5`, e o SDK deve reenviá-lo (`code: service_unavailable`).                         |

Regras da validação:

- **Eventos:** `exposure` e `track`, conforme `collectorEventSchema` em `packages/schemas`. O `eventId` é um UUID obrigatório; campos desconhecidos do evento são descartados.
- **Janela do `timestamp`:** no máximo 5 minutos no futuro e no máximo 7 dias no passado, senão o evento é rejeitado com `timestamp_out_of_range`.
- **Ambiente e key:** vêm sempre da autenticação, nunca do corpo (002/AC-2.4). Um campo `environmentId` dentro do evento é ignorado.
- **Códigos de rejeição:** `invalid_event` e `timestamp_out_of_range`.

## Formato dos objetos da bronze

O coletor não escreve tabelas Iceberg. Ele grava os eventos aceitos como objetos NDJSON comprimidos (gzip) no S3, no mesmo papel de um Firehose, e a worktree `pipeline` registra esses objetos na tabela `bronze.events_raw` (decisão D2 do plano).

```
s3://lever-lake/bronze/events_raw/environment_id=<uuid>/received_date=<AAAA-MM-DD>/<timestamp>-<uuid>.ndjson.gz
```

- **Particionamento:** por ambiente e pela data de recebimento em UTC (002/AC-3.1). Um envio cujos eventos atravessam a meia-noite UTC é dividido em um objeto por data, e cada evento cai na partição do dia em que foi recebido.
- **Nome:** `<timestamp>` é o instante da escrita, como `20261128T120001123Z`, seguido de um UUID.
- **Conteúdo:** uma linha JSON por evento, no formato `bronzeEventRecordSchema`: `{ event, receivedAt, environmentId, apiKeyId }`. O `event` é o evento como foi aceito. Os outros três campos são derivados pelo servidor.
- **Imutável:** os objetos só são criados, nunca alterados.
- **Compressão:** os objetos são `.ndjson.gz` e levam `Content-Encoding: gzip`. Um leitor que respeita esse cabeçalho pode descomprimir sozinho; o pipeline não deve descomprimir duas vezes.
- **Envio:** um objeto por ambiente a cada `COLLECTOR_FLUSH_INTERVAL_MS`, com no máximo `COLLECTOR_FLUSH_MAX_EVENTS` eventos. O evento só sai do buffer depois que o S3 confirmou a escrita. Cada escrita tem o limite de `COLLECTOR_SINK_WRITE_TIMEOUT_MS`. Se o envio falha, os eventos continuam no buffer e o reenvio espera mais a cada falha (de cerca de 250 ms a 30 s, com variação aleatória sobre o valor nominal de 500 ms), até um envio dar certo. O envio antecipado, quando um ambiente chega a `COLLECTOR_FLUSH_MAX_EVENTS`, só acontece enquanto o S3 está saudável.
- **Desligamento:** no `SIGTERM` ou `SIGINT`, o serviço para de aceitar requisições e tenta enviar o buffer por até `COLLECTOR_SHUTDOWN_FLUSH_MS`. Se o S3 estiver fora do ar ou lento, o que ainda não foi gravado depois desse prazo se perde; o número de eventos é registrado em log (nível `error`).

## Métricas

Em `GET /metrics`, com o prefixo `lever_collector_`:

| Métrica                                         | Tipo       | O que mede                                                                                                                                                                      |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lever_collector_events_total`                  | contador   | Eventos por `type` e `outcome` (`accepted`, `rejected` ou `refused`); `rejected` e `refused` trazem o `reason` (`refused` com `buffer_full`: o buffer cheio não aceitou o lote) |
| `lever_collector_request_batch_events`          | histograma | Eventos por `POST /v1/events` (lotes bem formados de uma key válida, aceitos ou recusados)                                                                                      |
| `lever_collector_buffer_events`                 | medidor    | Eventos aceitos esperando no buffer                                                                                                                                             |
| `lever_collector_batch_events`                  | histograma | Eventos por escrita bem-sucedida no S3                                                                                                                                          |
| `lever_collector_sink_write_duration_seconds`   | histograma | Duração das escritas no S3, com sucesso ou não                                                                                                                                  |
| `lever_collector_sink_failures_total`           | contador   | Escritas no S3 que falharam                                                                                                                                                     |
| `lever_collector_http_requests_total`           | contador   | Requisições por método, rota e status                                                                                                                                           |
| `lever_collector_http_request_duration_seconds` | histograma | Latência por rota                                                                                                                                                               |

Também há as métricas padrão do processo Node, com o mesmo prefixo. O `type` de um evento rejeitado é o tipo do evento quando ele foi lido (`timestamp_out_of_range`) e `unknown` só para `invalid_event`, que não tem tipo confiável. O Prometheus local lê o coletor pelo job `collector` (`host.docker.internal:4100`).

## Limites conhecidos

- **Queda abrupta perde eventos (D3).** O buffer fica só na memória. Com o S3 saudável, uma queda abrupta (`kill -9`, falta de memória) perde no máximo cerca de um intervalo de envio (1 s por padrão). Durante uma queda do S3 (ou com o S3 travado), uma queda abrupta do coletor perde tudo o que estava no buffer, até `COLLECTOR_BUFFER_MAX_EVENTS`. Um desligamento normal enquanto o S3 está fora do ar ou lento perde o que ainda não foi gravado depois de `COLLECTOR_SHUTDOWN_FLUSH_MS` (o número é registrado em log). Quando o S3 cai e volta com o coletor de pé, nenhum evento aceito com `202` se perde. Um spool em disco ou o Firehose (fase 5) resolve depois.
- **O buffer é limitado por eventos, não por bytes.** Eventos muito grandes durante uma queda longa do S3 podem esgotar a memória antes de o `503` entrar em ação.
- **Sem limite de requisições (D4).** O contrato reserva o `429`, mas o coletor ainda não o devolve.
- **`413` usa `bad_request`.** Ainda não existe um código de payload grande demais em `packages/schemas`.
- **Um ambiente com problema afeta os outros.** O backoff e o limite do buffer são compartilhados entre os ambientes. Se a escrita de um ambiente falha sempre (um registro que o S3 nunca aceita, por exemplo), ela fica repetindo, ocupa o buffer e atrasa os outros. Ainda não existe dead-letter por ambiente.
- **Um reenvio pode duplicar um objeto.** Se um envio escreve alguns objetos (datas diferentes) e falha em outro, o reenvio refaz tudo e os objetos que já tinham sido gravados ficam duplicados. A silver remove a duplicata pelo `eventId` (FR-003).
