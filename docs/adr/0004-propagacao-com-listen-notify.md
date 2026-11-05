# ADR-004 — Propagação de mudanças com `LISTEN/NOTIFY` do Postgres

| Campo  | Valor                                  |
| ------ | -------------------------------------- |
| Status | Aceito                                 |
| Data   | 05/11/2026                             |
| Spec   | 001 (FR-008, FR-009, NFR-003, NFR-004) |

## Contexto

Uma mudança feita no console precisa chegar ao serviço de decisão em segundos, sem deploy e sem perder a consistência entre a mudança, a auditoria e a versão de configuração (FR-009). O Postgres já é a fonte da verdade, e nesta fase tudo roda localmente.

## Decisão

- **Cada mudança publica uma versão.** O console grava a mudança, a auditoria e a próxima versão em `config_versions` na mesma transação. As linhas do ambiente são travadas com `FOR NO KEY UPDATE`; `FOR UPDATE` causava deadlock com os locks de chave estrangeira.
- **Um trigger notifica.** Em cada inserção em `config_versions`, o trigger (migration `0002`) envia `{ environmentId, version }` no canal `lever_config_changes`. O `NOTIFY` só é entregue se a transação for confirmada, então ninguém vê uma mudança desfeita.
- **O serviço escuta e recarrega.** Cada instância do serviço de decisão escuta o canal, recarrega só o ambiente afetado e ignora versões que já serve. Depois de uma reconexão, recarrega todos os ambientes em cache, porque as notificações enviadas enquanto estava desconectado se perdem.
- O canal e o formato da mensagem estão em `@lever/schemas` e são validados com Zod.

## Alternativas consideradas

- **Fila (Redis, SQS, Kafka):** mais robusta para muitas instâncias e regiões, mas acrescenta um componente para operar sem necessidade nesta fase.
- **Polling do banco:** simples, mas o atraso seria o intervalo e cada instância consultaria o banco o tempo todo.

## Consequências

- Várias instâncias funcionam, porque cada uma tem o próprio `LISTEN`. A fila só se justifica se a escala ou a distribuição geográfica exigirem.
- O `LISTEN` exige uma conexão direta com o Postgres. Um PgBouncer em modo de transação não serve para essa conexão.
- Se o Postgres cair, o serviço continua servindo a última configuração e as keys já conhecidas (NFR-004). As mudanças voltam a chegar quando a conexão volta.
- Medido localmente: 182 ms do console até o `/v1/config` no E2E (meta: 5 s, NFR-003).
