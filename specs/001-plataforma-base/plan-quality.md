# Plano — Spec 001, etapa `quality` parcial (worktree de ordem 3)

| Campo    | Valor                                                                                        |
| -------- | -------------------------------------------------------------------------------------------- |
| Spec     | `specs/001-plataforma-base/spec.md`                                                          |
| Etapa    | `quality` (seção 11, ordem 3), **parcial**                                                   |
| Worktree | `../lever-quality`, branch `feat/quality`                                                    |
| Status   | Aguardando aprovação do autor                                                                |
| Escopo   | `infra/k6`, `infra/grafana` e a seção de NFRs do `README.md`; o resto está nas decisões (§3) |

## 1. O que esta etapa entrega

A `quality` completa depende do SDK e da loja, que estão sendo feitos em outras worktrees. Esta etapa parcial entrega só o que já pode ser feito e medido com o serviço de decisão e o console:

- **k6 (NFR-002):** `infra/k6/evaluate.js`, com dois cenários. O `config` (`GET /v1/config`) já pode ser medido hoje e exercita autenticação e cache. O `evaluate` (`POST /v1/evaluate`) é a medição da NFR-002 e só passa a valer quando a sua avaliação existir (D1).
- **Dashboard `Lever / Decisão` (seção 10):** JSON versionado em `infra/grafana/dashboards/`, carregado pelo provisionamento que já existe. Ele usa os nomes reais de `services/decision/src/metrics.ts`.
- **Validação do dashboard:** um teste automático compara cada métrica usada nas consultas com as métricas que o serviço registra (D5). Além disso, confiro que o Grafana carrega o dashboard sem erro.
- **Medições no README (seção 12):** uma seção nova com o que já dá para medir (NFR-003 parcial, NFR-004, NFR-005 do `services/decision`) e o que fica pendente (NFR-001, NFR-002, NFR-005 do SDK).
- **Opcional, se você aprovar (D9):** infraestrutura de traces (Tempo) no compose, que as etapas `decision` (D8) e `console` (D10) deixaram para cá.

**Fora desta etapa parcial:** o teste de paridade da AC-5.8 (precisa do SDK e da sua avaliação) e os fluxos E2E da loja (precisam da loja). Detalhes na seção 7.

## 2. Versões e imagens

Mesma regra das etapas anteriores: versão exata, publicada há pelo menos 2 semanas (corte em 20/10/2026). Datas conferidas nas releases do GitHub e na API de tags do Docker Hub em 03/11/2026.

| Ferramenta                  | Versão / tag | Publicação | Observação                                                                                                                                          |
| --------------------------- | ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6 (binário local)          | `v2.2.0`     | 10/08/2026 | `k6-v2.2.0-windows-amd64.zip` (ou `.msi`) das releases do GitHub, para a medição oficial (D2)                                                       |
| Imagem `grafana/k6`         | `2.2.0`      | 10/08/2026 | Alternativa ao binário. A `2.3.0` saiu em 21/09, mas a imagem foi republicada em 24/10 (assim como `1.8.2` e `latest`), então fica abaixo do corte  |
| Imagem `grafana/grafana`    | `13.2.4`     | —          | Já está no compose. O JSON do dashboard segue o formato que essa versão exporta                                                                     |
| Imagem `prom/prometheus`    | `v3.15.0`    | —          | Já está no compose                                                                                                                                  |
| Imagem `grafana/tempo` (D9) | `3.1.0`      | 29/09/2026 | Só se a D9 for aprovada. Modo binário único, recebe OTLP direto, sem Kafka. A `3.1.1` e a `3.0.5` saíram em 21/10, depois do corte                  |
| Alternativas avaliadas (D9) | —            | —          | `otel/opentelemetry-collector-contrib:0.163.1` (16/10), `jaegertracing/jaeger:2.22.0` (06/10) e `grafana/otel-lgtm:0.37.0` (16/10), descritas na D9 |

O k6 2.x removeu comandos e executores antigos (`k6 pause`, `externally-controlled`, etc.). O script usa só `constant-arrival-rate`, `thresholds`, `setup` e `handleSummary`, que não mudaram. Não entra nenhuma dependência npm nova.

## 3. Decisões que preciso que você aprove

As decisões D5, D7 e D9 mexem em arquivos fora do escopo desta worktree (`services/decision`, `apps/console`, `infra/docker-compose.yml`, `.env.example`). Pelo AGENTS.md, preciso da sua autorização explícita para cada uma.

- **D1 — `/v1/evaluate` ainda responde 500.** O k6 contra essa rota hoje mediria só o tempo de montar um erro, o que não diz nada sobre a NFR-002. **Proposta:**
  - Um script com dois cenários, escolhidos por `-e SCENARIO=config` ou `-e SCENARIO=evaluate` (padrão: `evaluate`, que é o da NFR).
  - `config`: `GET /v1/config` a 500 req/s, com os mesmos limites da NFR. Serve como **referência** do caminho de autenticação, cache e serialização, e já pode ser medido hoje. No README ele aparece como referência, nunca como a NFR-002.
  - `evaluate`: `POST /v1/evaluate` a 500 req/s, com um usuário sintético diferente a cada requisição (`id` gerado e atributos `country` e `device` sorteados) e as chaves do seed (`new-banner` e `checkout-layout`).
  - No `setup()`, o cenário `evaluate` faz uma requisição de teste. Se receber 500, o k6 encerra com a mensagem "avaliação ainda não implementada (reservada ao autor)", em vez de gerar um relatório sem sentido. Quando a sua avaliação entrar, o mesmo script passa a medir a NFR-002 sem mudanças.
- **D2 — Como o k6 roda.** **Proposta:** a medição oficial usa o **binário local** `k6 v2.2.0`, com o serviço de decisão rodando no host (`pnpm --filter @lever/decision build` e depois `start`). Motivos:
  - Pelo Docker Desktop, cada requisição passa pelo encaminhamento de portas do WSL2 (`host.docker.internal`), o que acrescenta latência que não é do serviço e distorce um p99 de 20 ms.
  - O Docker Desktop desta máquina encerra o backend uns 4 minutos depois de iniciar, e isso derrubaria uma execução longa.

  A imagem `grafana/k6:2.2.0` fica documentada no `infra/k6/README.md` como alternativa (Linux, ou quem não quiser instalar o binário), com esse aviso. Cada cenário dura cerca de 1 min e 15 s (15 s de aquecimento e 60 s de medição), para caber na janela do Docker, que ainda é necessário para o Postgres.

- **D3 — De onde vem a API key.** **Proposta:** quem roda cria uma key de `development` com `pnpm --filter @lever/decision api-key:create -- --env development --name k6` (ou pelo console) e a passa ao k6 por variável de ambiente: `k6 run -e LEVER_API_KEY=<key> -e SCENARIO=config infra/k6/evaluate.js`. A key nunca fica em arquivo, e o script não a escreve no log nem no resumo. Sem `LEVER_API_KEY`, o `setup()` para com uma mensagem clara. A URL do serviço vem de `-e DECISION_URL` (padrão `http://localhost:4000`). Uso `development` porque, no seed, o `checkout-layout` só está `running` nesse ambiente.
- **D4 — k6 na CI.** **Proposta: não rodar agora.**
  - A NFR-002 é definida como medição **local**.
  - Os runners compartilhados do GitHub têm desempenho instável, e um p99 de 20 ms viraria um teste intermitente.
  - O cenário `evaluate` falharia até a sua avaliação existir.

  Se você quiser evitar que o script quebre sem ninguém perceber, a alternativa é um job de fumaça, não bloqueante, com o cenário `config` a 20 req/s por 10 s, só para validar o script. Isso mexe no `.github/workflows/ci.yml`. Prefiro deixar para quando o `evaluate` funcionar.

- **D5 — Onde fica o teste do dashboard.** O `infra/` não é um pacote do workspace e não tem Vitest. **Proposta:** um arquivo novo, `services/decision/test/dashboard.test.ts`, fora do escopo desta worktree. O serviço é o dono das métricas, então o teste fica junto delas. O teste:
  - lê `infra/grafana/dashboards/lever-decision.json` e confere `uid`, título, o datasource `prometheus` (o uid já provisionado) em todos os painéis, ids de painel únicos e as variáveis;
  - extrai todo nome `lever_decision_*` das expressões PromQL, tira os sufixos `_bucket`, `_sum` e `_count` dos histogramas e confere que cada um está registrado por `createMetrics()`;
  - confere que os rótulos usados em `by (...)` e nos filtros (`route`, `status_code`, `method`, `environment_id`, `le`) existem na métrica correspondente.

  O teste usa um `ConfigStore` falso em memória, sem Postgres, e não muda a cobertura de `src/`. Se alguém renomear uma métrica em `metrics.ts`, esse teste quebra no `pnpm test`.

  A alternativa seria criar um pacote `infra` no workspace, com `package.json` e Vitest próprios. Isso mexe no `pnpm-workspace.yaml` e no lockfile, e acho pesado demais para um teste só.

  Além do teste, faço uma conferência manual, curta o bastante para a janela do Docker:
  - subir `prometheus` e `grafana`, consultar `GET /api/dashboards/uid/lever-decision` (resposta 200) e procurar erros de provisionamento no log do Grafana;
  - com o serviço no ar e algum tráfego, rodar cada consulta pela API do Prometheus e conferir que nenhuma volta erro.

- **D6 — Título e identificação do dashboard.** **Proposta:**
  - título `Decisão`, na pasta `Lever`, que o provisionamento já cria (`folder: Lever`). O Grafana mostra `Lever / Decisão`, como a seção 10 pede, sem repetir "Lever" no nome;
  - `uid` fixo `lever-decision` e arquivo `lever-decision.json`.

  **Limite:** as métricas por ambiente só têm o rótulo `environment_id`, que é um UUID. O painel mostra o UUID, e a descrição do painel explica como achar o ambiente no banco. Para mostrar `demo-store / development`, o serviço precisaria expor uma métrica de informação, por exemplo `lever_decision_environment_info{environment_id, project, environment} 1`, que o dashboard juntaria com `group_left`. Isso muda o `services/decision`, então **não faço agora**. Fica como sugestão para quando você quiser.

- **D7 — Número da NFR-003.** O E2E `apps/console/e2e/flag.spec.ts` já confere que a mudança no console chega ao `/v1/config` em menos de 5 s, mas não guarda o tempo medido. **Proposta:** uma mudança pequena nesse arquivo, fora do escopo: registrar o tempo como anotação do Playwright (`test.info().annotations.push({ type: 'NFR-003', description: '<n> ms' })`), que aparece no relatório. A asserção não muda. Sem essa mudança, o README registra só "passa (abaixo de 5 s)", sem o número.

  Em todo caso, essa medição vai **do console ao serviço de decisão**. A NFR-003 fala em "até o SDK", então ela continua parcial até a `quality` final, com SDK e loja.

- **D8 — Formato da seção de medições no README.** **Proposta:** uma seção `## Medições dos requisitos não funcionais` no `README.md` da raiz, com uma tabela: NFR, meta, como foi medido (comando ou teste), resultado, data, commit e status (`atendido`, `parcial`, `referência` ou `pendente`). Logo abaixo, uma linha com o ambiente da medição: CPU, memória, sistema operacional, versão do Node, k6 rodando na mesma máquina, `LOG_LEVEL=warn` e traces desligados. Os números são locais e só fazem sentido com esse contexto. A seção "Estado atual" do README não muda, porque descreve outras etapas.
- **D9 — Traces (opcional).** A seção 10 pede traces, e as etapas anteriores deixaram o destino deles para cá. As duas aplicações já exportam por OTLP quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definido. **Proposta:** adicionar `grafana/tempo:3.1.0` ao compose, em modo binário único, com armazenamento local num volume e OTLP HTTP na porta 4318. Junto:
  - o arquivo de configuração em `infra/tempo/tempo.yml`;
  - o datasource Tempo, provisionado em `infra/grafana/provisioning/datasources/`;
  - no `.env.example`, a linha comentada `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

  Assim os traces aparecem no mesmo Grafana do dashboard. Isso mexe no `infra/docker-compose.yml` e no `.env.example`.

  Alternativas:
  - colocar um OpenTelemetry Collector (`0.163.1`) entre os serviços e o Tempo. Dá mais flexibilidade, mas é mais um contêiner sem ganho nesta fase;
  - Jaeger `2.22.0`, que traz interface própria, mas fica fora do Grafana;
  - `grafana/otel-lgtm`, que duplica o Prometheus e o Grafana que já temos;
  - adiar tudo.

  **Limite conhecido:** a seção 10 pede traces "do console ao Postgres". O console usa o driver `postgres` (postgres.js), e o OpenTelemetry oficial só instrumenta o `pg`. Então os spans de banco não aparecem sem instrumentação manual no `packages/db`, que não faço aqui. Se você aprovar a D9, ela vira o último commit e pode ser descartada sem afetar o resto.

## 4. Regras de comportamento

São escolhas onde a spec não é explícita. Me corrija se alguma estiver errada.

- **Carga do k6:**
  - executor `constant-arrival-rate` a 500 iterações/s (uma requisição por iteração), com `preAllocatedVUs: 50` e `maxVUs: 200`;
  - 15 s de aquecimento a 100 req/s, num cenário marcado como aquecimento que fica fora dos limites, e depois 60 s a 500 req/s.
- **Limites (thresholds), só no cenário medido:**
  - `http_req_duration` com `p(99)<20`;
  - `http_req_failed` com `rate<0.001`;
  - `dropped_iterations` com `count==0`, para garantir que as 500 req/s foram de fato enviadas;
  - `checks` com `rate==1` (status 200 e corpo com `version`).

  Se algum limite falhar, o k6 sai com código diferente de zero.

- **Resultado do k6:** o `handleSummary` mostra o resumo padrão e grava `infra/k6/results/<cenário>-<data>.json`. A pasta fica no `.gitignore` local (`infra/k6/.gitignore`). Os números que valem vão para o README à mão (D8).
- **Condições da medição:** o serviço roda compilado (`start`, nunca `tsx watch`), com `LOG_LEVEL=warn` e sem `OTEL_EXPORTER_OTLP_ENDPOINT`. Se a D9 for aprovada, faço uma segunda rodada com traces ligados, só para registrar o custo deles.
- **Dados:** só o seed e ids sintéticos (`k6-user-<vu>-<iteração>`), sem dados reais (AGENTS.md).
- **Painéis do dashboard** (variáveis: `route`, tirada dos rótulos de `lever_decision_http_requests_total`, e `environment_id`, tirada de `lever_decision_config_version`):

  | Linha    | Painel                                | Consulta (resumida)                                                                                                                                                                           |
  | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Tráfego  | Requisições por rota e status         | `sum by (route, status_code) (rate(lever_decision_http_requests_total{route=~"$route"}[$__rate_interval]))`                                                                                   |
  | Tráfego  | Taxa de erros 5xx por rota            | o mesmo, filtrado por `status_code=~"5.."`, dividido pelo total                                                                                                                               |
  | Latência | p50, p95 e p99 por rota               | `histogram_quantile(0.99, sum by (le, route) (rate(lever_decision_http_request_duration_seconds_bucket{route!="/v1/stream"}[$__rate_interval])))`, com linha de referência em 20 ms (NFR-002) |
  | Latência | Distribuição (heatmap)                | `sum by (le) (increase(lever_decision_http_request_duration_seconds_bucket{route=~"$route", route!="/v1/stream"}[$__rate_interval]))`                                                         |
  | Stream   | Clientes conectados por ambiente      | `sum by (environment_id) (lever_decision_stream_clients)`                                                                                                                                     |
  | Config   | Versão atual por ambiente             | `lever_decision_config_version{environment_id=~"$environment_id"}`                                                                                                                            |
  | Config   | Tempo desde a última atualização      | `lever_decision_config_age_seconds{environment_id=~"$environment_id"}`                                                                                                                        |
  | Processo | Alvo no ar, CPU, memória e event loop | `up{job="decision"}`, `rate(lever_decision_process_cpu_seconds_total[...])`, `lever_decision_process_resident_memory_bytes`, `lever_decision_nodejs_eventloop_lag_p99_seconds`                |

- **`/v1/stream` fora dos painéis de latência:** o hook `onResponse` registra a duração inteira da conexão SSE, que dura minutos e cai no balde `+Inf`. Incluí-la estragaria os percentis.
- **Resolução do histograma:** os baldes são 1, 2,5, 5, 10, 20 e 50 ms, então o p99 do servidor é interpolado entre 10 e 20 ms ou entre 20 e 50 ms. O número oficial da NFR-002 é o do k6, medido no cliente. O painel serve para acompanhar o teste.
- **Formato do JSON:** exportado do Grafana 13.2.4, com `id: null`, `uid` fixo, datasource referenciado pelo uid `prometheus` e sem `__inputs`. O provisionamento já tem `allowUiUpdates: false`, então o arquivo versionado é a única fonte.

## 5. Tarefas e commits

Todos na branch `feat/quality`, em Conventional Commits, sem atribuição ao Claude.

| #   | Commit                                                         | Arquivos                                                                                                                                                  |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `docs: add quality worktree plan`                              | este arquivo                                                                                                                                              |
| T2  | `test(infra): add k6 load test for remote evaluation`          | `infra/k6/evaluate.js` (D1–D3), `infra/k6/README.md` (como instalar o k6, criar a key, rodar cada cenário e ler o resultado), `infra/k6/.gitignore`       |
| T3  | `feat(infra): add decision grafana dashboard`                  | `infra/grafana/dashboards/lever-decision.json` (D6)                                                                                                       |
| T4  | `test(decision): check dashboard queries against metrics` (D5) | `services/decision/test/dashboard.test.ts`                                                                                                                |
| T5  | `test(console): record propagation time in flag e2e` (D7)      | `apps/console/e2e/flag.spec.ts` (só a anotação)                                                                                                           |
| T6  | `feat(infra): add tempo for local traces` (D9, opcional)       | `infra/docker-compose.yml`, `infra/tempo/tempo.yml`, `infra/grafana/provisioning/datasources/tempo.yml`, `.env.example`, `README.md` (tabela de serviços) |
| T7  | `docs: record nfr measurements`                                | `README.md`: a seção da D8, preenchida com as medições da seção 6                                                                                         |

Antes de abrir o PR: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm test`, além do rebase na `main`. O ESLint da raiz ignora `infra/**`, então o `evaluate.js` passa só pelo Prettier e pela execução real no k6.

## 6. Testes e medições

| Teste ou medição                                         | O que verifica                                                                                                                               | Cobre                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `k6 run -e SCENARIO=config infra/k6/evaluate.js`         | `GET /v1/config` a 500 req/s: p99 abaixo de 20 ms, menos de 0,1% de falhas, nenhuma iteração descartada                                      | NFR-002 (**referência**, não fecha a NFR)    |
| `k6 run -e SCENARIO=evaluate infra/k6/evaluate.js`       | Hoje: encerra no `setup()` com "avaliação ainda não implementada". Com a sua avaliação: `POST /v1/evaluate` a 500 req/s, p99 abaixo de 20 ms | NFR-002                                      |
| `services/decision/test/dashboard.test.ts` (D5)          | JSON válido, `uid` e título, datasource, toda métrica e rótulo do PromQL existem em `createMetrics()`                                        | Seção 10 (dashboard)                         |
| Conferência manual do Grafana                            | Provisionamento carrega `lever-decision` sem erro; cada consulta roda na API do Prometheus sem erro; painéis mostram dados durante o k6      | Seção 10                                     |
| `apps/console/e2e/flag.spec.ts` (já existe; D7)          | Console até `/v1/config` em menos de 5 s, com o tempo registrado                                                                             | NFR-003 (parcial: sem o SDK), AC-1.1, AC-1.2 |
| `services/decision/test/propagation.test.ts` (já existe) | Publicar uma versão faz o `/v1/config` refletir a mudança em menos de 5 s                                                                    | NFR-003 (parcial, lado do servidor)          |
| `services/decision/test/resilience.test.ts` (já existe)  | Postgres parado: `/v1/config` e o stream continuam com a última configuração e a key em cache                                                | NFR-004                                      |
| `pnpm --filter @lever/decision test` (cobertura)         | Linhas, funções, ramos e instruções acima de 80% em `services/decision`, com o limite já configurado                                         | NFR-005 (só a parte do `services/decision`)  |

Cada teste novo cita o requisito no nome, por exemplo `it('spec 001 section 10: every metric in the dashboard is registered by the service', ...)`.

**Roteiro de verificação, por causa do Docker Desktop:** o backend cai uns 4 minutos depois de iniciar, então divido o trabalho em janelas curtas, reiniciando o Docker entre elas.

1. **Janela 1:** Postgres, migrate, seed, criação da key, serviço no ar e o cenário `config` do k6 (cerca de 1 min e 15 s), com o Prometheus coletando.
2. **Janela 2:** Grafana e Prometheus, conferência do provisionamento e das consultas.
3. **Janela 3, se a D9 for aprovada:** Tempo e um trace de `/v1/config` visível no Grafana.

Os testes com Testcontainers (`pnpm test`, cobertura e resiliência) também precisam do Docker e rodam logo depois de um reinício, como nas etapas anteriores.

## 7. O que esta etapa parcial **não** fecha

- **NFR-001:** precisa do SDK (Vitest bench no `packages/sdk`).
- **NFR-002:** o script fica pronto, mas a medição de `/v1/evaluate` depende da sua avaliação em `packages/evaluation`. Até lá, o README registra só a referência do `/v1/config`.
- **NFR-003 de ponta a ponta:** a medição até o SDK precisa do SDK e da loja.
- **NFR-005 do `packages/sdk`:** fica com a worktree `sdk`.
- **AC-5.8 (paridade com 10.000 casos):** precisa do SDK, que está em outra worktree, e da sua avaliação.
- **Fluxos E2E da loja** (AC-1.1 e AC-1.2 completas, AC-8.x, os dois navegadores em variantes estáveis da seção 12): precisam da loja, que está em outra worktree.
- **Métricas do SDK na loja** (avaliações por segundo e idade do cache, seção 10) e os painéis correspondentes: chegam com o SDK e a loja.
- **Traces "do console ao Postgres":** mesmo com a D9, faltam os spans do driver `postgres` (ver o limite na D9).
- **Nome legível do ambiente no dashboard:** depende da métrica de informação sugerida na D6.
