# ADR-003 — Server-Sent Events para o stream de configuração

| Campo  | Valor                                 |
| ------ | ------------------------------------- |
| Status | Aceito                                |
| Data   | 05/11/2026                            |
| Spec   | 001 (FR-006, AC-5.4, AC-5.6, NFR-003) |

## Contexto

O SDK precisa receber cada nova versão da configuração em poucos segundos (NFR-003: menos de 5 s do console até o SDK). O fluxo é de mão única: o serviço de decisão envia e o SDK só recebe. A autenticação é por API key no cabeçalho `Authorization`.

## Decisão

- **SSE em `GET /v1/stream`.** Na conexão, o serviço envia `event: config` com a configuração completa. Depois envia um `config` a cada versão mais nova e um `ping` a cada 15 s. Cada `config` leva `id: <versão>`.
- **No serviço**, a resposta é assumida pela rota (`reply.hijack()` no Fastify), com `Cache-Control: no-cache` e `X-Accel-Buffering: no`. Os streams abertos são encerrados no desligamento.
- **No SDK**, o stream é lido com `fetch` e um parser próprio, e não com `EventSource`. O `EventSource` do Node 24 é experimental e não permite enviar o cabeçalho `Authorization`.
- **Queda e reconexão:** o SDK trata 45 s sem dados (três pings) como queda e reconecta com backoff exponencial (500 ms até 30 s, com variação aleatória). A última configuração válida nunca é apagada. 401, 403 e 404 param as tentativas.
- Como cada conexão começa com a configuração completa, não é preciso reenviar eventos perdidos nem fazer polling.

## Alternativas consideradas

- **WebSocket:** bidirecional, o que o caso não precisa; exige outro protocolo, mais código e cuidado com proxies.
- **Polling de `/v1/config`:** simples, mas cada SDK consultaria o serviço o tempo todo e o atraso seria o intervalo de polling.

## Consequências

- Funciona sobre HTTP comum, passa por proxies e é fácil de testar com `curl -N`.
- Cada SDK mantém uma conexão aberta. A métrica `lever_decision_stream_clients` acompanha quantas há.
- O histograma de latência por rota mede a conexão inteira do stream, então `/v1/stream` fica fora dos painéis de latência do dashboard.
- Medido: uma mudança publicada chega ao cliente do stream em menos de 0,5 s localmente.
