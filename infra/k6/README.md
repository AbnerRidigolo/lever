# infra/k6

Testes de carga com k6. O `evaluate.js` mede a NFR-002 da spec [001](../../specs/001-plataforma-base/spec.md): avaliação remota com p99 abaixo de 20 ms a 500 requisições por segundo, local. As decisões estão no [plano da etapa `quality`](../../specs/001-plataforma-base/plan-quality.md) (D1 a D4).

## Cenários

| `SCENARIO`          | Rota                | Para que serve                                                                                                      |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `evaluate` (padrão) | `POST /v1/evaluate` | A medição da NFR-002. Usa um usuário sintético por requisição e as chaves do seed (`new-banner`, `checkout-layout`) |
| `config`            | `GET /v1/config`    | **Referência**: mede autenticação, cache e serialização. Não fecha a NFR-002                                        |

Cada execução tem 15 s de aquecimento a 100 req/s (fora dos limites) e 60 s medidos a 500 req/s. Os limites valem só na fase medida:

- `http_req_duration` p99 abaixo de 20 ms;
- `http_req_failed` abaixo de 0,1%;
- `dropped_iterations` igual a zero (as 500 req/s foram de fato enviadas);
- `checks` (status 200 e corpo com `version`) acima de 99,9%.

Se algum limite falhar, o k6 sai com código 99.

Enquanto a avaliação do autor (`packages/evaluation`) lançar `not implemented`, o cenário `evaluate` para no `setup()` com a mensagem "evaluation is not implemented yet" e código 108, sem gerar números.

## Como rodar

1. **Instale o k6 v2.2.0** fora do repositório: o `k6-v2.2.0-windows-amd64.zip` (ou o `.tar.gz` do Linux, ou o `.zip` do macOS) das [releases do GitHub](https://github.com/grafana/k6/releases/tag/v2.2.0). Confira o SHA-256 com o `k6-v2.2.0-checksums.txt` da mesma página.
2. **Suba o banco e o serviço compilado.** Não use `tsx watch` para medir:

   ```bash
   docker compose up -d postgres
   pnpm db:migrate && pnpm db:seed
   pnpm build
   DECISION_PORT=4200 LOG_LEVEL=warn pnpm --filter @lever/decision start
   ```

   Sem `OTEL_EXPORTER_OTLP_ENDPOINT`, os traces ficam desligados, que é a condição da medição registrada no README.

3. **Crie uma API key de `development`** (no seed, o `checkout-layout` só está `running` nesse ambiente):

   ```bash
   pnpm --filter @lever/decision api-key:create -- --env development --name k6
   ```

   A key aparece uma única vez. Guarde-a só na variável de ambiente da sessão, nunca em arquivo do repositório.

4. **Rode, da raiz do repositório:**

   ```bash
   # bash
   export LEVER_API_KEY='<key>'
   k6 run -e DECISION_URL=http://localhost:4200 -e SCENARIO=config infra/k6/evaluate.js
   k6 run -e DECISION_URL=http://localhost:4200 -e SCENARIO=evaluate infra/k6/evaluate.js
   ```

   ```powershell
   # PowerShell
   $env:LEVER_API_KEY = '<key>'
   k6 run -e DECISION_URL=http://localhost:4200 -e SCENARIO=config infra/k6/evaluate.js
   ```

   A key é lida do ambiente do shell, e não por `-e`, para não aparecer na linha de comando. `DECISION_URL` tem como padrão `http://localhost:4000`.

O k6 mostra um resumo com p50, p95, p99 e o resultado de cada limite, e grava o resumo completo em `infra/k6/results/<cenário>-<data>.json`. Essa pasta está no `.gitignore`. Os números que valem vão para a seção de medições do [README da raiz](../../README.md).

Para só testar o script, sem valor de medição, use `-e RATE=50 -e DURATION=5s -e WARMUP=2s`.

### Pela imagem Docker

Alternativa ao binário (por exemplo, no Linux):

```bash
docker run --rm -i -e LEVER_API_KEY -e RESULTS_DIR=/tmp grafana/k6:2.2.0 \
  run -e DECISION_URL=http://host.docker.internal:4200 -e SCENARIO=config - < infra/k6/evaluate.js
```

No Docker Desktop (Windows e macOS), cada requisição passa pelo encaminhamento de portas da VM, o que acrescenta latência que não é do serviço. Por isso a medição oficial usa o binário local. Em algumas máquinas, o Docker Desktop também encerra o backend poucos minutos depois de iniciar, e cada cenário dura cerca de 1 min e 15 s.

## Na CI

O k6 não roda na CI (plano, D4): a NFR é medida localmente, e os runners compartilhados dariam resultados instáveis.
