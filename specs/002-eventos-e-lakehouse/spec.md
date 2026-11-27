# Spec 002 — Eventos, lakehouse e análise estatística (fase 2)


| Campo         | Valor                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status        | Aprovada pelo autor em 27/11/2026, com todas as questões da seção 13 respondidas                                                                                                                      |
| Fase          | 2 de 5                                                                                                                                                                  |
| Depende de    | Spec 001 concluída, inclusive a avaliação do autor em `packages/evaluation` (sem ela não há atribuição real nem exposições)                                              |
| Pronta quando | o console mostra o resultado de um A/B da loja com efeito, intervalo de confiança e checagem de SRM, calculado a partir de eventos que passaram por bronze, silver e gold |


> **Convenção de IDs.** As histórias, critérios e requisitos desta spec recomeçam a numeração. Fora deste arquivo, cite-os com o prefixo da spec: `002/AC-3.2`, `002/FR-005`. Nos testes, o nome segue o AGENTS.md (`it('002/AC-3.2: ...')`). Veja a questão Q1 da seção 13.

## 1. Objetivo

Fechar o ciclo de medição do Lever: a loja gera eventos, o SDK os envia, um coletor os grava crus no lakehouse, o pipeline os transforma em métricas por variante e a análise estatística diz se a diferença entre as variantes é real. O console exibe o resultado com efeito, intervalo de confiança, p-valor e alertas de qualidade (SRM).

A fase 1 decide "o que cada usuário vê". A fase 2 responde "e o que aconteceu por causa disso".

## 2. Escopo

**Dentro**

- Envio de eventos pelo SDK: exposições automáticas e eventos de negócio (`track`), em lote e sem bloquear o app.
- Serviço de coleta (`services/collector`): recebe, valida, deduplica e grava os eventos crus na bronze.
- ELT: eventos crus e mudanças de configuração (a partir do `audit_log`) na bronze.
- ETL: pedidos da loja limpos, deduplicados e com dados pessoais mascarados antes de carregar.
- Lakehouse em Iceberg com as camadas bronze, silver (Spark) e gold (dbt), com testes de qualidade.
- Catálogo de métricas no console: conversão, receita por usuário e taxas por usuário, com papel primária, secundária ou de proteção.
- Análise estatística de experimentos: diferença de proporções e de médias, intervalos de confiança, CUPED, SRM e tamanho de amostra.
- Gerador de tráfego sintético com efeitos conhecidos, para validar a análise (testes A/A e A/B com efeito injetado).
- Observabilidade da coleta e do pipeline: métricas, traces e o dashboard `Lever / Eventos`.

**Fora (specs futuras)**

- Recomendação, features de treino e feature store (003). A gold desta fase não gera features.
- Agentes, parecer automático e rollback automático por métrica de proteção (004). Aqui as métricas de proteção são calculadas e exibidas, sem ação automática.
- Infra na AWS com Terraform, Step Functions e EventBridge (005). Nesta fase tudo roda local (decisão D1, ADR-006, tomada pelo autor em 27/11/2026).
- Testes sequenciais e bayesianos. Esta fase usa horizonte fixo com tamanho de amostra planejado.
- SDK para o navegador. Os eventos de navegação da loja saem do servidor (Server Components e Server Actions).
- Direito ao esquecimento e retenção configurável. Só há dados sintéticos.
- Experimentos mutuamente exclusivos (camadas). A spec 001 os adiou para cá; agora vão para uma spec própria (Q8).

## 3. Atores


| Ator           | Descrição                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Editor         | Define métricas, associa métricas a experimentos e planeja o tamanho amostral |
| Leitor         | Lê resultados                                                                 |
| App cliente    | Envia exposições e eventos pelo SDK (aqui, a loja)                            |
| Pipeline       | Jobs que movem e transformam dados entre bronze, silver e gold                |
| Job de análise | Lê a gold, roda a estatística do autor e grava os resultados no Postgres      |


## 4. Histórias de usuário e critérios de aceite

### US-1 — Enviar eventos pelo SDK

Como desenvolvedor do app cliente, quero registrar eventos com uma linha de código, sem afetar a latência nem a estabilidade do app.

- **AC-1.1** `lever.track('purchase', user, { orderId, revenueCents })` enfileira o evento e retorna imediatamente, sem `await` e sem lançar exceção, mesmo com o coletor fora do ar.
- **AC-1.2** Com o envio de eventos ligado, cada exposição do AC-5.7 da spec 001 também é enfileirada para o coletor, além dos ouvintes de `onExposure`.
- **AC-1.3** Os eventos saem em lotes: ao atingir o tamanho máximo do lote ou o intervalo de envio, o que vier primeiro. `flush()` envia o que estiver na fila e `close()` faz um último `flush()`.
- **AC-1.4** Cada evento tem um `eventId` (UUID) gerado no SDK. Um reenvio do mesmo lote, depois de uma falha, usa os mesmos `eventId`.
- **AC-1.5** Se o coletor falhar (erro de rede, 5xx ou 429), o SDK reenvia com backoff exponencial. Uma resposta 4xx que não seja 429 descarta o lote e registra o motivo.
- **AC-1.6** A fila tem limite de tamanho. Quando cheia, o SDK descarta os eventos mais antigos e incrementa um contador de descartes, sem crescer a memória.
- **AC-1.7** Um evento inválido (nome fora do padrão, propriedade com tipo não suportado) é descartado no SDK com log, sem lançar exceção.

### US-2 — Coletar eventos

Como plataforma, quero receber eventos de muitos apps sem perder nem duplicar dados na análise.

- **AC-2.1** `POST /v1/events` com API key válida e um lote válido responde 202 e informa quantos eventos foram aceitos.
- **AC-2.2** Num lote com eventos válidos e inválidos, os válidos são aceitos e os inválidos voltam na resposta com o índice e o código do erro. Um evento inválido nunca derruba o lote.
- **AC-2.3** API key ausente, revogada ou inválida responde 401, no formato de `packages/schemas/errors.ts`.
- **AC-2.4** O ambiente do evento vem da API key, nunca do corpo da requisição.
- **AC-2.5** O mesmo `eventId` enviado duas vezes aparece uma única vez na silver.
- **AC-2.6** Se o destino da bronze estiver indisponível, o coletor guarda os eventos num buffer limitado. Com o buffer cheio, responde 503 com `Retry-After`, e nenhum evento aceito com 202 se perde.
- **AC-2.7** O coletor acrescenta `receivedAt` (horário do servidor) a cada evento e rejeita eventos com `timestamp` mais de 5 minutos no futuro ou mais de 7 dias no passado.

### US-3 — Lakehouse

Como engenheiro de dados, quero camadas com responsabilidades claras, para reprocessar e auditar qualquer número.

- **AC-3.1** A bronze guarda os eventos exatamente como o coletor os aceitou, particionados por ambiente e data de recebimento. Nada na bronze é alterado nem apagado pelo pipeline.
- **AC-3.2** A silver tem eventos tipados e deduplicados por `eventId`. Eventos que não passam na validação da silver vão para uma tabela de quarentena com o motivo, e não somem.
- **AC-3.3** As mudanças de configuração chegam à bronze a partir do `audit_log`, de forma incremental: cada execução copia só os registros novos.
- **AC-3.4** Os pedidos da loja passam pelo ETL antes de carregar: nome e endereço são mascarados, pedidos repetidos (mesmo `orderId`) são deduplicados, e o pedido limpo carrega direto na silver. O pedido cru, com dados pessoais, nunca é gravado no lakehouse.
- **AC-3.5** Reprocessar a silver e a gold do zero a partir da bronze produz exatamente os mesmos resultados (pipeline idempotente).
- **AC-3.6** Os modelos dbt da gold têm testes de qualidade (chaves únicas, não nulos, valores aceitos e integridade entre tabelas), e o pipeline para quando um teste falha.
- **AC-3.7** A gold registra até quando os dados estão completos (`data_through`), e o console mostra essa data junto de cada resultado.

### US-4 — Definir métricas

Como editor, quero declarar as métricas de um experimento antes de ele começar, para evitar escolher a métrica depois de ver o resultado.

- **AC-4.1** O editor cria uma métrica no catálogo do projeto com chave, nome, tipo e direção desejada (aumentar ou diminuir). Tipos desta fase:
  - `conversion`: proporção de usuários expostos que fizeram o evento X ao menos uma vez;
  - `mean`: média por usuário exposto de uma propriedade numérica de um evento (ex.: receita), contando zero para quem não fez o evento;
  - `ratio`: razão entre as somas de dois eventos por usuário (ex.: cliques por visualização), analisada com o método delta.
- **AC-4.2** Um experimento tem exatamente uma métrica primária, até 10 secundárias e qualquer número de métricas de proteção.
- **AC-4.3** Métricas e papéis não podem ser alterados com o experimento em `running`, como os pesos no AC-3.6 da spec 001.
- **AC-4.4** Criar, alterar ou excluir uma métrica gera registro de auditoria, como no AC-6.1 da spec 001. Uma métrica usada por um experimento não pode ser excluída.

### US-5 — Planejar o tamanho de amostra

Como editor, quero saber quantos usuários o experimento precisa antes de ligá-lo, para não decidir cedo demais.

- **AC-5.1** Para uma métrica de conversão, dados a taxa de base, o efeito mínimo detectável (MDE, absoluto ou relativo), α e poder, o console calcula o tamanho por variante. Exemplo de referência: base 10%, MDE absoluto de 1 ponto percentual, α = 0,05 bicaudal e poder 0,8 resultam em cerca de 14.750 usuários por variante.
- **AC-5.2** Para uma métrica de média, o cálculo usa a média e o desvio padrão de base informados pelo editor.
- **AC-5.3** Com mais de duas variantes, o cálculo aplica a correção de comparações múltiplas da seção 8.4.
- **AC-5.4** O tamanho planejado fica salvo no experimento, e a página de resultados mostra o progresso (usuários expostos ÷ planejado).
- **AC-5.5** Os valores calculados batem com uma implementação de referência (statsmodels) com erro relativo abaixo de 1%, nos casos de teste da seção 8.6.

### US-6 — Ler o resultado de um experimento

Como leitor, quero ver se uma variante é melhor que o controle e com que certeza.

- **AC-6.1** Para cada métrica e cada variante não controle, o console mostra: usuários expostos, valor da métrica no controle e na variante, efeito absoluto e relativo, intervalo de confiança de 95% do efeito e p-valor.
- **AC-6.2** Um efeito é marcado como significativo só quando o p-valor, já corrigido para comparações múltiplas, fica abaixo de α, e a interface diz se o efeito vai na direção desejada da métrica.
- **AC-6.3** Antes de atingir o tamanho planejado, o console mostra os números, mas não marca nada como significativo, e avisa que olhar antes do fim aumenta a chance de falso positivo.
- **AC-6.4** Métricas de proteção que pioram de forma significativa aparecem destacadas, mesmo antes do tamanho planejado.
- **AC-6.5** Só entram na análise os eventos de cada usuário a partir da primeira exposição dele ao experimento, até o fim do experimento.
- **AC-6.6** Um usuário exposto a mais de uma variante do mesmo experimento é excluído da análise, e o console mostra quantos usuários foram excluídos.
- **AC-6.7** Os resultados são por ambiente, e o padrão exibido é `production`.

### US-7 — Detectar sorteio quebrado (SRM)

Como leitor, quero ser avisado quando a divisão real de usuários não bate com os pesos, porque nesse caso o resultado não é confiável.

- **AC-7.1** A cada cálculo, o job compara os usuários expostos por variante com os pesos configurados, usando o teste qui-quadrado de aderência.
- **AC-7.2** Com p-valor abaixo de 0,001, o console mostra um alerta de SRM acima de todos os resultados do experimento e não marca nenhum efeito como significativo.
- **AC-7.3** Casos de referência num 50/50: 10.000 contra 10.400 usuários (p ≈ 0,005) **não** gera alerta; 10.000 contra 10.600 (p ≈ 0,00003) gera.

### US-8 — Reduzir variância com CUPED

Como leitor, quero intervalos mais estreitos sem precisar de mais usuários.

- **AC-8.1** Para métricas `conversion` e `mean`, o job calcula também a versão ajustada por CUPED, usando como covariável o valor da mesma métrica no período anterior à primeira exposição de cada usuário. A janela do período anterior está na seção 8.3.
- **AC-8.2** O console mostra o resultado ajustado como principal quando houver covariável, e permite ver o resultado sem ajuste.
- **AC-8.3** Nos dados sintéticos com covariável correlacionada, o intervalo ajustado é mais estreito que o sem ajuste, e o efeito estimado continua sem viés (seção 8.6).
- **AC-8.4** Usuários sem histórico no período anterior entram com covariável zero, sem serem excluídos.

### US-9 — Validar a plataforma com dados sintéticos

Como autor do projeto, quero provar que a análise não inventa diferenças e encontra as reais.

- **AC-9.1** O gerador de tráfego cria usuários sintéticos com atributos e comportamento configuráveis (taxa de base, distribuição de receita, correlação com o histórico) e envia os eventos pelo SDK de verdade, passando pelo coletor.
- **AC-9.2** Teste A/A: em 1.000 experimentos A/A simulados com α = 0,05, a taxa de falsos positivos fica entre 3,6% e 6,4%.
- **AC-9.3** Cobertura do intervalo: em 1.000 experimentos com efeito injetado conhecido, o intervalo de 95% contém o efeito verdadeiro em 93,6% a 96,4% dos casos.
- **AC-9.4** Poder: em 200 experimentos com o tamanho planejado para poder de 0,8, o efeito injetado é detectado em 74% a 86% dos casos.
- **AC-9.5** De ponta a ponta: o gerador roda o experimento `checkout-layout` na loja com um efeito injetado na conversão, o pipeline completo roda, e o console mostra um intervalo que contém esse efeito.

> As simulações dos AC-9.2 a 9.4 testam a estatística do autor diretamente sobre estatísticas suficientes geradas em memória, sem passar pelo lakehouse (rápido o bastante para o CI). O AC-9.5 é o único que passa por todas as camadas.

### US-10 — Loja instrumentada

Como autor do projeto, quero que a loja gere os eventos de que a análise precisa.

- **AC-10.1** A loja envia `page_view`, `product_view`, `add_to_cart`, `checkout_start`, `checkout_error` e `purchase`, com o mesmo id de usuário usado na avaliação (AC-8.4 da spec 001).
- **AC-10.2** Cada pedido concluído gera um evento `purchase` (com `orderId` e `revenueCents`) e grava o pedido completo em `store_orders`, na mesma ação do checkout, para o ETL (US-3, AC-3.4). Se a gravação falhar, o checkout falha e o usuário vê o erro.
- **AC-10.3** As exposições do `checkout-layout` e da flag `new-banner` chegam ao coletor (o hook deixa de só registrar em log).
- **AC-10.4** O envio de eventos não muda o tempo de resposta das páginas da loja de forma perceptível (NFR-004).

## 5. Requisitos funcionais


| ID     | Requisito                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | O SDK envia exposições e eventos `track` ao coletor em lotes, de forma assíncrona e com fila limitada.                                     |
| FR-002 | O coletor expõe `POST /v1/events`, autenticado pela mesma API key da spec 001, e grava os eventos aceitos na bronze.                       |
| FR-003 | A entrega dos eventos é "pelo menos uma vez" até a bronze; a deduplicação por `eventId` acontece na silver.                                |
| FR-004 | As mudanças de configuração vão do `audit_log` para a bronze por extração incremental.                                                     |
| FR-005 | Os pedidos da loja passam por um ETL que limpa, deduplica e mascara antes de carregar na silver.                                           |
| FR-006 | O lakehouse usa tabelas Iceberg com as camadas bronze, silver e gold; a silver é feita com Spark e a gold com dbt.                        |
| FR-007 | O projeto tem um catálogo de métricas; cada experimento declara métrica primária, secundárias e de proteção antes de entrar em `running`.  |
| FR-008 | A gold produz, por experimento, ambiente, variante e métrica, as estatísticas suficientes que a análise precisa (seção 8.2).              |
| FR-009 | O job de análise calcula efeitos, intervalos, p-valores, CUPED e SRM com a estatística do autor e grava o resultado no Postgres.          |
| FR-010 | O console exibe resultados, alertas de SRM, progresso amostral e a calculadora de tamanho de amostra.                                     |
| FR-011 | Um gerador de tráfego sintético produz usuários e eventos com efeitos conhecidos, usando o SDK.                                           |
| FR-012 | Um comando único roda o pipeline local de ponta a ponta: extração, silver, gold, testes de qualidade e análise.                           |


## 6. Requisitos não funcionais


| ID      | Requisito                                                                                                       | Como medir                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| NFR-001 | Coletor: p99 de `POST /v1/events` abaixo de 50 ms com 1.000 eventos por segundo (lotes de 50), local            | k6 em `infra/k6/collector.js`                                |
| NFR-002 | Nenhum evento aceito com 202 se perde quando o destino da bronze cai e volta                                    | Teste de integração derrubando o contêiner do armazenamento |
| NFR-003 | Pipeline local completo (bronze até resultados) com 1 milhão de eventos em menos de 10 minutos                  | Execução cronometrada com o gerador de tráfego               |
| NFR-004 | `track()` no SDK: p99 abaixo de 0,1 ms; o envio não aumenta o p95 das páginas da loja em mais de 5 ms           | Vitest bench no SDK; E2E da loja com e sem envio             |
| NFR-005 | Estatística validada: AC-9.2 a AC-9.4 passando no CI                                                          | Testes de simulação em `packages/stats`                      |
| NFR-006 | Cobertura de testes acima de 80% em `services/collector`, `services/analysis` e no código de eventos do SDK     | Relatório do Vitest                                          |


## 7. Modelo de dados

### 7.1 Postgres (OLTP), em `packages/db`

Mesmas convenções da spec 001: `id` (uuid), `created_at` e `updated_at` em todas as tabelas.


| Tabela               | Campos principais                                                                                                                                                  | Observação                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `metrics`            | project\_id, key, name, type (`conversion`, `mean`, `ratio`), event\_name, value\_property, denominator\_event\_name, direction (`increase`, `decrease`)            | Única por projeto e chave; campos opcionais conforme o tipo, validados no Zod |
| `experiment_metrics` | experiment\_id, metric\_id, role (`primary`, `secondary`, `guardrail`)                                                                                            | Exatamente uma `primary` por experimento (índice único parcial)             |
| `experiments` (+)    | planned\_sample\_size, mde, mde\_kind (`absolute` ou `relative`), alpha (padrão 0,05), power (padrão 0,8)                                                              | Colunas novas                                                               |
| `analysis_runs`      | environment\_id, started\_at, finished\_at, status, data\_through, error                                                                                           | Uma linha por execução do job de análise                                    |
| `experiment_results` | analysis\_run\_id, experiment\_id, environment\_id, metric\_id, variant\_key, users, value, delta\_abs, delta\_rel, ci\_low, ci\_high, p\_value, p\_value\_adjusted, cuped, method | Uma linha por métrica, variante e ajuste (com e sem CUPED)                  |
| `srm_checks`         | analysis\_run\_id, experiment\_id, environment\_id, observed (jsonb), expected (jsonb), p\_value, excluded\_users                                                  |                                                                             |
| `store_orders`       | order\_id, user\_id, items (jsonb), total\_cents, customer\_name, address (jsonb), status (`pending_etl`, `loaded`), placed\_at                                      | Pedidos fictícios da loja, fila do ETL (Q5, decidida). O ETL nunca apaga linhas; só muda o status                             |


`audit_resource_type` ganha `metric`.

### 7.2 Lakehouse (Iceberg)


| Camada | Tabela                     | Conteúdo                                                                                                                | Partição                |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| bronze | `events_raw`               | O evento aceito pelo coletor, em JSON, mais `received_at`, `environment_id` e `api_key_id`                              | ambiente, dia de recebimento |
| bronze | `config_changes_raw`       | Linhas do `audit_log` copiadas como estão                                                                               | dia                     |
| silver | `events`                   | Eventos tipados e deduplicados por `event_id`                                                                           | ambiente, dia do evento |
| silver | `events_quarantine`        | Eventos rejeitados na silver, com o motivo                                                                              | dia                     |
| silver | `exposures`                | Exposições tipadas (experimento, variante, usuário, versão da configuração)                                             | ambiente, dia           |
| silver | `orders`                   | Pedidos limpos e mascarados, saída do ETL                                                                               | dia                     |
| silver | `config_changes`           | Mudanças de configuração tipadas                                                                                        | dia                     |
| gold   | `experiment_assignments`   | Por experimento, ambiente e usuário: variante, primeira exposição e se foi excluído (AC-6.6)                            | experimento             |
| gold   | `experiment_user_metrics`  | Por experimento, usuário e métrica: valor no período do experimento e covariável do período anterior (CUPED)            | experimento             |
| gold   | `experiment_variant_stats` | Estatísticas suficientes por experimento, ambiente, variante e métrica (seção 8.2)                                      | experimento             |
| gold   | `pipeline_watermarks`      | `data_through` por ambiente                                                                                             | —                       |


## 8. Análise estatística

**Toda a estatística é reservada ao autor (AGENTS.md).** O agente cria `packages/stats` com as assinaturas (`throw new Error('not implemented: reserved for author')`), os tipos de entrada e saída em `packages/schemas` e os testes derivados desta seção. A implementação é do autor.

### 8.1 Unidade e atribuição

- A unidade de análise é o usuário (o `userId` da avaliação).
- Entra na análise quem teve ao menos uma exposição com o experimento em `running` no ambiente analisado.
- Para cada usuário, contam os eventos de `primeira exposição` até `fim do experimento` (ou `data_through`, o que vier antes).
- Consequência aceita da spec 001 (seção 13): quando o id anônimo vira id de conta no login, a pessoa passa a ser outra unidade.

### 8.2 Estatísticas suficientes (contrato gold → análise)

A gold não calcula testes. Ela entrega, por experimento, ambiente, variante e métrica, os agregados de que a análise precisa, e o `packages/stats` faz as contas:

- `conversion` e `mean`: `n`, `sum_y`, `sum_y2`; com CUPED, também `sum_x`, `sum_x2` e `sum_xy` (x é a covariável).
- `ratio`: `n`, `sum_num`, `sum_num2`, `sum_den`, `sum_den2` e `sum_num_den`, para o método delta.
- SRM: usuários expostos por variante e pesos configurados.

O formato exato vira um schema Zod em `packages/schemas` (`variantStatsSchema`).

### 8.3 Métodos (direção inicial, a confirmar pelo autor)


| Caso                            | Método                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `conversion`                    | Teste z para diferença de proporções; IC de Wald para a diferença absoluta                     |
| `mean`                          | Teste t de Welch; IC da diferença de médias                                                    |
| `ratio`                         | Método delta para a variância da razão; teste z                                                |
| Efeito relativo                 | IC pelo método delta sobre `delta / média do controle`                                         |
| CUPED                           | θ = cov(x, y) / var(x) com os dados das variantes juntas; y ajustado = y − θ(x − média de x)    |
| Janela do período anterior      | 14 dias antes da primeira exposição de cada usuário                                            |
| SRM                             | Qui-quadrado de aderência; alerta com p < 0,001                                                |
| Tamanho de amostra              | Fórmula de duas amostras com aproximação normal, bicaudal                                      |


### 8.4 Comparações múltiplas

- Cada variante é comparada só com o controle.
- Com mais de uma variante não controle, o p-valor da métrica primária é corrigido por Holm-Bonferroni entre as variantes.
- As métricas secundárias são exibidas com a correção entre as variantes e um aviso de que são exploratórias. Não há correção entre métricas.
- As métricas de proteção usam α próprio (padrão 0,05, unilateral na direção de piora).

### 8.5 Horizonte fixo

O experimento é planejado com um tamanho de amostra (US-5). Antes de atingi-lo, o console mostra os números sem marcar significância (AC-6.3). Testes sequenciais ficam para uma spec futura.

### 8.6 Validação

- **Contra referência:** casos de teste com valores esperados gerados por scipy e statsmodels, salvos como fixtures JSON em `packages/stats/test/fixtures/` com o script que os gerou. O teste em TypeScript compara com tolerância relativa de 1e-6.
- **Por simulação:** os AC-9.2 a AC-9.4, com semente fixa para serem reproduzíveis.
- **CUPED:** em dados com correlação de 0,7 entre covariável e métrica, a variância do efeito ajustado cai pelo menos 40%, e a média dos efeitos estimados em 1.000 simulações fica a menos de 2 erros padrão do efeito verdadeiro.

## 9. Decisões que viram ADR


| ADR     | Pergunta                                          | Direção inicial                                                                                                                                                                                                      |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-006 | Lakehouse local ou na AWS nesta fase? (**D1**)    | **Decidido pelo autor em 27/11/2026: local.** Peças compatíveis com a AWS: MinIO no lugar do S3, catálogo Iceberg REST no lugar do Glue Data Catalog e Trino no lugar do Athena (o Athena v3 é baseado em Trino). dbt com `dbt-trino` agora e `dbt-athena` na 005. |
| ADR-007 | Garantia de entrega dos eventos                   | "Pelo menos uma vez" do SDK até a bronze, deduplicação por `eventId` na silver. Sem tentar "exatamente uma vez" no coletor.                                                                                           |
| ADR-008 | Onde fica a estatística?                          | A gold entrega estatísticas suficientes em SQL; os testes ficam em TypeScript (`packages/stats`), testáveis sem banco e reaproveitáveis pelos agentes da 004.                                                        |
| ADR-009 | Por que ETL para pedidos e ELT para eventos?      | Pedidos têm dados pessoais e não podem existir crus no lakehouse, então são limpos antes de carregar. Eventos não têm dados pessoais e chegam crus, para permitir reprocessamento.                                  |
| ADR-010 | Como capturar mudanças do Postgres (CDC)?         | Extração incremental do `audit_log`, que já é só inserção e tem o diff completo. O DMS entra na 005, se houver motivo.                                                                                               |


## 10. Contratos

Os schemas Zod ficam em `packages/schemas`.

**Lote de eventos**

```
POST /v1/events
Authorization: Bearer <api key>
{ events: Event[] }                  (1 a 500 eventos, até 512 KB)
→ 202 { accepted: number, rejected: [{ index, code, message }] }
→ 401 | 413 | 429 | 503 (Retry-After)   no formato de erro da spec 001
```

**Evento**

```
Event =
  | { type: 'exposure', eventId, experimentKey, variantKey, userId, configVersion, timestamp, sdk }
  | { type: 'track', eventId, name, userId, timestamp, properties, sdk }

name:       ^[a-z][a-z0-9_]{0,63}$
properties: Record<string, string | number | boolean>   (até 32 chaves, sem objetos aninhados)
sdk:        { name: '@lever/sdk', version }
```

O evento de exposição estende o `exposureEventSchema` da spec 001 com `eventId` e `sdk`, sem quebrar o hook `onExposure`.

**Pedido para o ETL**

```
{ orderId, userId, placedAt, items: [{ productId, quantity, unitPriceCents }], totalCents,
  customer: { name, address: { street, city, state } } }   → silver.orders sem customer.name e com o endereço reduzido a `state`
  (`state`: uma das 27 UFs)
```

**Opções novas do SDK**

```ts
createLeverClient({
  ...,
  events: { url: 'http://localhost:4100', flushIntervalMs: 5000, maxBatchSize: 100, maxQueueSize: 10000 },
});
lever.track(name, user, properties?): void
lever.flush(): Promise<void>
```

Sem a opção `events`, o SDK se comporta exatamente como na spec 001.

## 11. Observabilidade

- **Coletor:** eventos recebidos, aceitos e rejeitados por tipo e motivo; tamanho dos lotes; latência por rota; ocupação do buffer; latência e falhas de escrita na bronze.
- **SDK (exposto pela loja):** eventos enfileirados, enviados, reenviados e descartados; tamanho da fila.
- **Pipeline:** duração e status de cada etapa; `data_through` por ambiente (atraso do pipeline); linhas em quarentena; testes do dbt com falha.
- **Análise:** duração do job, experimentos analisados, alertas de SRM ativos.
- **Traces:** do SDK ao coletor e à escrita na bronze; do job de análise ao Trino e ao Postgres.
- **Dashboard** `Lever / Eventos` em `infra/grafana/dashboards/`, com as métricas acima.

## 12. Plano de worktrees


| Ordem | Worktree        | Escopo                                                                                                                                         | Quem                                                    |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0     | `base-002`      | `packages/schemas` (eventos, métricas, resultados, estatísticas suficientes), `packages/db` (tabelas e migration), MinIO, catálogo Iceberg e Trino no compose, `.env.example` | Agente, revisado pelo autor                             |
| 1     | `stats`         | `packages/stats`: testes, z, t de Welch, método delta, CUPED, SRM, Holm, tamanho de amostra                                                   | **Autor** (o agente entrega assinaturas, fixtures e testes) |
| 1     | 1     | `collector`     | `services/collector`: rota, validação, buffer, escrita na bronze, métricas e traces                                                           | Agente                                                  |
| 1     | `sdk-events`    | `packages/sdk`: `track`, fila, lotes, reenvio, exposições para o coletor                                                                       | Agente                                                  |
| 1     | `pipeline`      | `services/pipeline` (TypeScript: extração do `audit_log`, ETL de pedidos, comando `pipeline:run`), `data/spark` (jobs PySpark da silver) e `data/dbt` (modelos e testes da gold)                           | Agente                                                  |
| 1     | `console-002`   | Catálogo de métricas, calculadora de tamanho de amostra e páginas de resultados                                                      | Agente                                                  |
| 2     | `analysis`      | `services/analysis`: job que lê a gold, chama `packages/stats` e grava resultados                                                             | Agente (usa a estatística do autor)                     |
| 2     | `store-002`     | Loja: eventos, pedidos para o ETL, exposições para o coletor                                                                                   | Agente                                                  |
| 2     | `traffic`       | Gerador de tráfego sintético                                                                                                                   | Agente                                                  |
| 3     | `quality-002`   | Simulações A/A e de poder, E2E de ponta a ponta (AC-9.5), k6 do coletor, dashboard, medições no README                                       | Agente, revisado pelo autor                             |


A worktree 0 termina antes das demais e é a única que cria migration até a ordem 1 terminar. As de ordem 1 rodam em paralelo. `analysis` e `quality-002` dependem do `stats` do autor.

## 13. Questões e decisões

Todas as questões foram respondidas pelo autor em 27/11/2026.


| #   | Questão                                                                                                                                                       | Decisão                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Os IDs recomeçam em cada spec (AC-1.1 existe na 001 e na 002). Como citar nos testes?                                                                        | **Decidido pelo autor em 27/11/2026.** Prefixo da spec fora do próprio arquivo e nos testes novos (`002/AC-1.1`). Os testes da 001 continuam como estão. A regra já está no AGENTS.md.                                                                        |
| Q2  | Lakehouse local (MinIO, Iceberg REST, Trino) ou AWS de verdade já nesta fase? (D1)                                                                           | **Decidido pelo autor em 27/11/2026: local.** Motivos: como na spec 001, CI sem credenciais, custo zero e testes com Testcontainers. A ideação cita Firehose, Glue e Athena; eles entram na 005 trocando adaptadores (destino do coletor, catálogo e adapter do dbt), sem mudar contratos.   |
| Q3  | Onde ficam os jobs Spark e o projeto dbt? O AGENTS.md não tem pasta para isso.                                                                               | **Decidido pelo autor em 27/11/2026:** `data/spark` (PySpark) e `data/dbt` para o Python e o SQL; `services/pipeline` para o TypeScript (extração do `audit_log`, handler do ETL de pedidos e orquestrador `pipeline:run`). Python fica restrito ao Spark e ao treino, como diz a ideação. A estrutura do AGENTS.md já foi atualizada.                                                                           |
| Q4  | O job de análise é um serviço novo (`services/analysis`) ou parte do coletor?                                                                                | **Decidido pelo autor em 27/11/2026.** `services/analysis`, separado do coletor e do pipeline: o coletor precisa de baixa latência e o job é em lote. Ele roda como comando (`pnpm analysis:run`) e, localmente, a cada hora pelo compose. Expõe `/metrics` enquanto roda, como pede o AGENTS.md. A pasta já está na estrutura do AGENTS.md.                         |
| Q5  | Como os pedidos chegam ao ETL? Hoje a loja não grava pedido nenhum.                                                                                           | **Decidido pelo autor em 27/11/2026: tabela `store_orders`.** A loja grava o pedido completo em `store_orders` (Postgres) na mesma ação do checkout, e o ETL lê os pendentes, limpa, carrega na silver e marca como `loaded`. Motivo: se o ETL cair, nenhum pedido se perde e a receita por usuário continua certa. A função do ETL tem a forma de um handler de Lambda, para virar Lambda na 005. Descartado: a loja chamar o ETL direto, que perderia pedidos com o ETL fora do ar. |
| Q6  | O que mascarar nos pedidos?                                                                                                                                   | **Decidido pelo autor em 27/11/2026.** Remover o nome, reduzir o endereço à UF e manter `userId` (já é pseudônimo). Mesmo com dados fictícios, o ETL é testado como se fossem reais.                                                                                               |
| Q7  | A métrica `ratio` (ex.: CTR) entra nesta fase?                                                                                                                | **Decidido pelo autor em 27/11/2026.** Sim (tipo `ratio` do AC-4.1, com método delta), porque a fase 3 precisa do CTR das recomendações.                                                                                                              |
| Q8  | Camadas entram nesta fase? A spec 001 as adiou para cá.                                                                                                       | **Decidido pelo autor em 27/11/2026: spec própria.** A história das camadas, o requisito, a tabela `layers`, o ADR-011 e a worktree `layers` saíram desta spec, e as histórias seguintes foram renumeradas. Motivo: a parte do autor nesta fase já é grande, e nada na demo da fase 2 precisa de camadas. Elas voltam numa spec curta quando dois experimentos disputarem a mesma área, provavelmente na fase 3.                                                                                           |
| Q9  | Quais métricas de proteção padrão a loja usa?                                                                                                                 | **Decidido pelo autor em 27/11/2026.** Taxa de erro de checkout e tempo até a compra. Latência das páginas fica no Grafana, não no experimento, porque não é um evento por usuário. O "tempo até a compra" ficou fora do seed da fase 2 porque nenhum tipo de métrica do AC-4.1 o mede corretamente: `mean` conta zero para quem não comprou. Vai para uma spec futura (decisão D6 do plano base-002).                                                                                               |
| Q10 | Janela de CUPED de 14 dias e α = 0,001 no SRM estão bons?                                                                                                     | **Decidido pelo autor em 27/11/2026.** Sim como padrão, configuráveis por projeto numa spec futura.                                                                                                                                                                                 |
| Q11 | O SDK deve deduplicar exposições em memória (mesmo usuário, experimento e variante), para reduzir volume?                                                    | **Decidido pelo autor em 27/11/2026.** Sim, com um LRU limitado. A análise usa a primeira exposição, então a deduplicação não muda nenhum resultado.                                                                                                                              |
| Q12 | Os resultados são calculados também para `development`?                                                                                                       | **Decidido pelo autor em 27/11/2026.** Sim, para a demo local funcionar, mas o console mostra `production` por padrão e marca `development` como ambiente de teste.                                                                                                              |
