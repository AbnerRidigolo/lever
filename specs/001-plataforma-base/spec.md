# Spec 001 — Plataforma base (fase 1)


| Campo         | Valor                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Status        | Rascunho                                                                                                                          |
| Fase          | 1 de 5                                                                                                                            |
| Depende de    | nada (primeira spec)                                                                                                              |
| Pronta quando | uma flag alterada no console aparece na loja em até 5 segundos, e um experimento A/B atribui cada usuário sempre à mesma variante |


## 1. Objetivo

Entregar o núcleo do Lever: times criam feature flags e experimentos A/B no console, um serviço de decisão distribui essa configuração, o SDK avalia flags e variantes dentro do app cliente, e a loja de demonstração usa tudo isso de verdade.

Esta fase não mede resultados. A coleta de eventos e a análise estatística chegam na spec 002. Aqui o objetivo é que a decisão de "o que cada usuário vê" funcione de forma rápida, estável e auditável.

## 2. Escopo

**Dentro**

- Console com login, papéis, projetos, ambientes, flags, experimentos, segmentos, API keys e histórico de auditoria.
- Serviço de decisão: entrega a configuração, avalia remotamente e transmite atualizações em tempo real.
- SDK TypeScript com avaliação local, cache e fallback.
- Loja de demonstração usando uma flag e um experimento.
- Observabilidade mínima: métricas, traces e um dashboard no Grafana.

**Fora (specs futuras)**

- Coleta de eventos, lakehouse e estatística (002).
- Recomendação e ML (003).
- Agentes de IA (004).
- Infra na AWS com Terraform (005). Nesta fase tudo roda local com Docker Compose.

## 3. Atores


| Ator          | Descrição                                                       |
| ------------- | --------------------------------------------------------------- |
| Admin         | Gerencia o projeto, membros, API keys e tudo o que o editor faz |
| Editor        | Cria e altera flags, experimentos e segmentos                   |
| Leitor        | Só visualiza                                                    |
| App cliente   | Aplicação que integra o SDK (aqui, a loja)                      |
| Usuário final | Pessoa que navega na loja e recebe flags e variantes            |


## 4. Histórias de usuário e critérios de aceite

### US-1 — Ligar e desligar uma feature flag

Como editor, quero ligar e desligar uma funcionalidade sem deploy, para lançar e reverter com segurança.

- **AC-1.1** Dado uma flag booleana `new-banner` desligada em `production`, quando o editor a liga no console, então a loja passa a exibir o banner novo em até 5 segundos, sem recarregar o servidor.
- **AC-1.2** Dado uma flag ligada, quando o editor a desliga, então a loja volta ao comportamento padrão em até 5 segundos.
- **AC-1.3** Uma flag alterada em `development` não afeta `production`.
- **AC-1.4** Uma flag pode ser booleana, string, número ou JSON, e o console valida o valor conforme o tipo.

### US-2 — Liberação gradual

Como editor, quero liberar uma flag para uma porcentagem dos usuários, para reduzir o risco de um lançamento.

- **AC-2.1** Dado um rollout de 10%, quando 100.000 ids sintéticos são avaliados, então entre 9,5% e 10,5% recebem a flag ligada.
- **AC-2.2** Dado um usuário que recebeu a flag com rollout de 10%, quando o rollout sobe para 50%, então esse usuário continua recebendo a flag (ninguém sai, só entra gente).
- **AC-2.3** O mesmo usuário recebe sempre o mesmo resultado para a mesma configuração, em qualquer instância do serviço ou do SDK.

### US-3 — Criar um experimento A/B

Como editor, quero dividir usuários entre variantes, para comparar versões de uma funcionalidade.

- **AC-3.1** O editor cria um experimento com chave, hipótese, 2 a 5 variantes e pesos que somam 100%.
- **AC-3.2** Dado um experimento 50/50, quando 100.000 ids sintéticos são avaliados, então cada variante recebe entre 49,5% e 50,5%.
- **AC-3.3** Um usuário atribuído a uma variante permanece nela enquanto o experimento estiver em execução.
- **AC-3.4** A atribuição de um experimento é independente da de outro: estar na variante B do experimento X não altera a chance de estar na variante B do experimento Y.
- **AC-3.5** Um experimento tem os estados `draft`, `running`, `paused` e `completed`. Só `running` atribui variantes; nos demais, todos recebem a variante de controle.
- **AC-3.6** Pesos e variantes não podem ser alterados com o experimento em `running`. Para mudar, é preciso pausar, e o console avisa que isso invalida a análise.

### US-4 — Segmentação

Como editor, quero que uma flag ou experimento valha só para um público, para testar com quem faz sentido.

- **AC-4.1** O editor cria um segmento com regras sobre atributos do usuário (ex.: `country = BR` e `device in [mobile]`).
- **AC-4.2** Operadores suportados: `equals`, `not_equals`, `in`, `not_in`, `greater_than`, `less_than`, `contains`.
- **AC-4.3** Uma flag ou experimento pode apontar para um segmento. Usuários fora do segmento recebem o valor padrão ou a variante de controle.
- **AC-4.4** Atributo ausente no contexto do usuário nunca casa com a regra.

### US-5 — Integrar pelo SDK

Como desenvolvedor do app cliente, quero avaliar flags e variantes com uma linha de código, sem adicionar latência perceptível.

- **AC-5.1** `lever.getFlag('new-banner', user, false)` retorna o valor da flag ou o padrão informado.
- **AC-5.2** `lever.getVariant('checkout-layout', user)` retorna a chave da variante.
- **AC-5.3** Depois de inicializado, o SDK avalia localmente, sem chamada de rede por avaliação.
- **AC-5.4** O SDK recebe atualizações pelo stream e aplica a nova configuração sem reiniciar o app.
- **AC-5.5** Se o serviço de decisão estiver fora do ar na inicialização, o SDK retorna os valores padrão e tenta reconectar com backoff exponencial.
- **AC-5.6** Se o stream cair depois de inicializado, o SDK continua com a última configuração válida.
- **AC-5.7** O SDK expõe o hook `onExposure(event)`, chamado a cada atribuição de variante. Nesta fase o hook só registra em log; a spec 002 o conecta ao coletor.
- **AC-5.8** O SDK e o serviço de decisão produzem exatamente o mesmo resultado para a mesma configuração e o mesmo usuário (teste de paridade com 10.000 casos).

### US-6 — Auditoria

Como admin, quero saber quem mudou o quê, para investigar problemas.

- **AC-6.1** Toda criação, alteração ou exclusão de flag, experimento, segmento ou API key gera um registro com autor, data, ação e o diff antes e depois.
- **AC-6.2** O histórico é filtrável por recurso, autor e período, e não pode ser editado nem apagado pelo console.

### US-7 — Acesso ao console

Como admin, quero controlar quem acessa o projeto, para evitar mudanças indevidas.

- **AC-7.1** Login com e-mail (link mágico) ou GitHub.
- **AC-7.2** Leitor não vê botões de edição, e a API recusa a ação com 403 mesmo que a chamada seja forjada.
- **AC-7.3** Admin cria e revoga API keys por ambiente. A key completa aparece só uma vez, na criação.

### US-8 — Loja de demonstração

Como autor do projeto, quero uma loja que use o Lever, para demonstrar o sistema funcionando.

- **AC-8.1** A loja tem vitrine, página de produto, carrinho e um checkout fictício, com produtos gerados por seed.
- **AC-8.2** A flag `new-banner` controla o banner da home (US-1).
- **AC-8.3** O experimento `checkout-layout` alterna entre checkout em uma página e em etapas (US-3).
- **AC-8.4** O usuário da loja é identificado por um id anônimo persistido em cookie, com atributos `country` e `device`.
- **AC-8.5** A avaliação acontece no servidor (Server Components), sem piscar a variante errada na tela.

## 5. Requisitos funcionais


| ID     | Requisito                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | O sistema organiza tudo em projetos, e cada projeto tem os ambientes `development` e `production`.                                  |
| FR-002 | Flags têm chave única por projeto, tipo, valor padrão e, por ambiente, estado (on/off), valor servido, rollout e segmento opcional. |
| FR-003 | Experimentos têm chave única por projeto, hipótese, variantes com pesos, segmento opcional, estado e datas de início e fim.         |
| FR-004 | A atribuição é determinística: depende só da chave do recurso, de um salt por recurso e do id do usuário.                           |
| FR-005 | O serviço de decisão expõe a configuração completa de um ambiente, autenticada por API key.                                         |
| FR-006 | O serviço de decisão transmite atualizações por Server-Sent Events.                                                                 |
| FR-007 | O serviço de decisão oferece avaliação remota para clientes que não podem avaliar localmente.                                       |
| FR-008 | Alterações no console chegam ao serviço de decisão via `LISTEN/NOTIFY` do Postgres.                                                 |
| FR-009 | Toda mutação no console grava auditoria na mesma transação da mudança.                                                              |
| FR-010 | O console exibe, para cada flag e experimento, o histórico de mudanças e onde ele está ativo.                                       |


## 6. Requisitos não funcionais


| ID      | Requisito                                                                       | Como medir                                 |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| NFR-001 | Avaliação local no SDK: p99 abaixo de 1 ms                                      | Benchmark com Vitest bench                 |
| NFR-002 | Avaliação remota: p99 abaixo de 20 ms com 500 requisições por segundo, local    | k6 em `infra/k6/evaluate.js`               |
| NFR-003 | Propagação de uma mudança do console até o SDK: abaixo de 5 s                   | Teste E2E que mede o tempo                 |
| NFR-004 | O serviço de decisão continua servindo a última configuração se o Postgres cair | Teste de integração derrubando o container |
| NFR-005 | Cobertura de testes acima de 80% em `services/decision` e `packages/sdk`        | Relatório do Vitest                        |


## 7. Modelo de dados

Rascunho para `packages/db`. Nomes em inglês; todas as tabelas têm `id` (uuid), `created_at` e `updated_at`.


| Tabela                    | Campos principais                                                                           | Observação                                      |
| ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `users`                   | email, name, avatar\_url                                                                    | Contas do console                               |
| `projects`                | name, slug                                                                                  |                                                 |
| `project_members`         | project\_id, user\_id, role (`admin`, `editor`, `viewer`)                                   | Única por projeto e usuário                     |
| `environments`            | project\_id, key (`development`, `production`)                                              |                                                 |
| `api_keys`                | environment\_id, name, key\_hash, last\_used\_at, revoked\_at                               | Só o hash é guardado                            |
| `segments`                | project\_id, key, name, rules (jsonb)                                                       | Regras validadas por schema Zod                 |
| `flags`                   | project\_id, key, type, default\_value (jsonb), salt                                        | Salt gerado na criação, nunca alterado          |
| `flag_environments`       | flag\_id, environment\_id, enabled, served\_value (jsonb), rollout\_bps, segment\_id        | `rollout_bps` em pontos-base (0 a 10.000)       |
| `experiments`             | project\_id, key, hypothesis, status, salt, segment\_id, started\_at, ended\_at             |                                                 |
| `experiment_variants`     | experiment\_id, key, weight\_bps, is\_control                                               | Soma dos pesos = 10.000; exatamente um controle |
| `experiment_environments` | experiment\_id, environment\_id, status                                                     | Estado por ambiente                             |
| `audit_log`               | project\_id, actor\_id, action, resource\_type, resource\_id, before (jsonb), after (jsonb) | Só inserção; sem update nem delete              |
| `config_versions`         | environment\_id, version, published\_at                                                     | Incrementa a cada mudança publicada             |


## 8. Contratos

Os schemas Zod ficam em `packages/schemas`. Formato resumido:

**Configuração de um ambiente**

```
GET /v1/config
Authorization: Bearer <api key>
→ 200 { version, flags: FlagConfig[], experiments: ExperimentConfig[], segments: SegmentConfig[] }

```

**Stream de atualizações**

```
GET /v1/stream
Authorization: Bearer <api key>
→ text/event-stream
   event: config  data: { version, ...configuração completa }
   event: ping    data: {}            (a cada 15 s)

```

**Avaliação remota**

```
POST /v1/evaluate
Authorization: Bearer <api key>
{ user: { id, attributes }, flags?: string[], experiments?: string[] }
→ 200 { flags: { [key]: value }, experiments: { [key]: variantKey }, version }

```

**Contexto do usuário**

```
{ id: string, attributes: Record<string, string | number | boolean | string[]> }

```

**Evento de exposição** (hook do SDK)

```
{ type: 'exposure', experimentKey, variantKey, userId, configVersion, timestamp }

```

## 9. Decisões que viram ADR


| ADR     | Pergunta                             | Direção inicial                                                                   |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| ADR-001 | Avaliar no SDK ou no servidor?       | Local no SDK, com avaliação remota como alternativa                               |
| ADR-002 | Qual função de hash para atribuição? | A decidir pelo autor (MurmurHash3 ou SHA-256 truncado), com teste de uniformidade |
| ADR-003 | SSE ou WebSocket para o stream?      | SSE: unidirecional, simples, passa por proxies                                    |
| ADR-004 | Como propagar mudanças do banco?     | `LISTEN/NOTIFY` agora; avaliar fila só se houver várias instâncias                |
| ADR-005 | Autenticação do console              | Auth.js com link mágico e GitHub                                                  |


## 10. Observabilidade

- Métricas do serviço de decisão: requisições por rota, latência (histograma), clientes conectados no stream, versão de configuração atual e tempo desde a última atualização.
- Métrica do SDK (exposta pela loja): avaliações por segundo e idade da configuração em cache.
- Traces com OpenTelemetry do console ao Postgres e do serviço de decisão ao SDK.
- Dashboard no Grafana `Lever / Decisão` versionado em `infra/grafana/dashboards/`.

## 11. Plano de worktrees


| Ordem | Worktree     | Escopo                                                                                                   | Quem                              |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0     | `base`       | Monorepo, `packages/config`, `packages/schemas`, `packages/db` (schema, migration, seed), docker-compose | Agente, revisado pelo autor       |
| 1     | `decision`   | `services/decision`: rotas, stream, `LISTEN/NOTIFY`, métricas                                            | Agente                            |
| 1     | `assignment` | Hash, bucketing e avaliação de regras                                                                    | **Autor**                         |
| 1     | `sdk`        | `packages/sdk`: cliente, cache, stream, fallback, hook                                                   | Agente (usa a avaliação do autor) |
| 1     | `console`    | `apps/console`: auth, papéis, CRUDs, auditoria                                                           | Agente                            |
| 2     | `store`      | `apps/store`: loja e integração com o SDK                                                                | Agente                            |
| 3     | `quality`    | E2E, k6, teste de paridade, dashboard do Grafana                                                         | Agente, revisado pelo autor       |


A worktree 0 termina antes das demais. As worktrees de ordem 1 rodam em paralelo; a loja depende do SDK pronto.

## 12. Critérios de sucesso da fase

- Todos os AC acima com teste automatizado passando no CI.
- NFR-001 a NFR-005 medidos e registrados no README.
- Uma demonstração gravada: ligar a flag no console e ver a loja mudar, e mostrar dois navegadores caindo em variantes diferentes de forma estável.

## 13. Questões em aberto e decisões


| Questão                                                                                                                                  | Decisão (29/10/2026)                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O id anônimo da loja deve ser substituído por um id de conta quando o usuário fizer login? Isso afeta a estabilidade da atribuição.      | Sim. No login, o id da conta substitui o id anônimo. Consequência aceita: a variante de um usuário pode mudar no momento do login.                              |
| Experimentos mutuamente exclusivos (camadas) entram nesta fase ou na 002?                                                                | Ficam para a spec 002.                                                                                                                                          |
| O SDK terá uma versão para o navegador nesta fase, ou só servidor?                                                                       | Só servidor nesta fase.                                                                                                                                         |
| Como as condições de um segmento se combinam?                                                                                            | Só por **E** nesta fase. As regras ficam em `{ conditions: [...] }`, o que permite adicionar grupos com **OU** depois sem quebrar o formato.                     |
| `experiments.status` e `experiment_environments.status`: qual vale?                                                                     | O estado por ambiente (`experiment_environments.status`) é o servido em `/v1/config`. `experiments.status` é o estado geral exibido no console.                 |
| Soma dos pesos = 10.000 e exatamente um controle: onde garantir?                                                                         | No Zod, na fronteira. O banco garante só "no máximo um controle" (índice único parcial).                                                                       |
| Pode apagar um segmento usado por uma flag ou experimento?                                                                               | Não. As chaves estrangeiras usam `RESTRICT`.                                                                                                                    |
| API keys: formato e algoritmo do hash                                                                                                   | Definidos na worktree `decision`. O banco já tem `key_prefix` para o console mostrar a key mascarada.                                                          |
| Imagem do Postgres local                                                                                                                 | `pgvector/pgvector` com Postgres 17, já pronta para a fase 3 (extensão disponível, não ativada).                                                               |