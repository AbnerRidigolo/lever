# apps/store

Loja de demonstração do Lever (Next.js, App Router): vitrine, produto, carrinho e checkout fictício, com a flag `new-banner` e o experimento `checkout-layout`. Spec: [001](../../specs/001-plataforma-base/spec.md). Plano: [`plan-store.md`](../../specs/001-plataforma-base/plan-store.md).

## Como rodar

```bash
pnpm build
pnpm --filter @lever/store dev          # http://localhost:3002
```

Variáveis (no `.env` da raiz, com valores fictícios no `.env.example`):

- `STORE_SESSION_SECRET`: assina o cookie da conta fictícia (obrigatória, 16 caracteres ou mais).
- `LEVER_ADAPTER`: `sdk` (padrão) usa o `@lever/sdk` contra o serviço de decisão; `stub` roda a loja sozinha, servindo os valores padrão. O `.env.example` vem com `stub`, para a loja subir sem key.
- `LEVER_DECISION_URL` e `LEVER_API_KEY`: para o SDK (a key é obrigatória com `sdk`). A key é de `development`, porque o `checkout-layout` só roda lá no seed. Ela é criada no console ou com `pnpm --filter @lever/decision api-key:create -- --env development --name store`.
- `LEVER_STUB_OVERRIDES`: valores que o stub serve para todos, como `{"flags":{"new-banner":true}}`.

## Como funciona

- **Identidade:** o `src/proxy.ts` cria o cookie `lever_uid` na primeira visita e o repassa à própria requisição. `country` vem do `Accept-Language` e `device` do `User-Agent`. Com uma conta fictícia (`/account`), o id da conta substitui o id anônimo; ao sair, o id anônimo volta.
- **Lever:** as páginas usam `getLever()` (`src/lever/`), que devolve o adaptador envolvido por `withSafety`. Erros viram o valor padrão ou o controle, são contados e registrados sem dados do usuário.
- **SDK:** um cliente por processo (`src/lever/sdk-adapter.ts`). As primeiras requisições esperam a configuração por até 2 s; qualquer resultado de `ready()` diferente de `ready` é registrado e a loja serve os padrões enquanto o SDK reconecta. Enquanto a avaliação do autor (`@lever/evaluation`) lançar `not implemented`, o SDK serve o padrão da flag e o controle do experimento.
- **Stub:** sem rede e sem hash. Serve o padrão da flag e o controle do experimento, salvo sobrescritas da variável `LEVER_STUB_OVERRIDES` ou do Painel do Lever (cookie deste navegador).
- **Sem piscar:** toda página é dinâmica e avaliada no servidor. Só a versão certa do banner e do checkout chega ao HTML.
- **Painel do Lever** (rodapé): id em uso, `country`, `device`, valor de `new-banner`, persona de demonstração e sobrescritas do stub. A variante do checkout aparece só na página de checkout, para não gerar exposição de quem não chegou lá.
- **Catálogo:** 24 produtos fictícios em `src/catalog/products.json`, gerados por `pnpm --filter @lever/store catalog:generate` com semente fixa.
- **Observabilidade:** `/metrics` com `lever_sdk_evaluations_total`, `lever_sdk_evaluation_errors_total`, `lever_sdk_config_age_seconds` e `lever_sdk_config_version`, além das métricas do Node. Traces por OTLP quando `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido.

## Testes

```bash
pnpm --filter @lever/store test         # Vitest
pnpm --filter @lever/store build
pnpm --filter @lever/store test:e2e     # stub e, em seguida, SDK real (precisa do Postgres)
pnpm --filter @lever/store test:e2e:sdk # só os fluxos com o SDK real
```

- **Com o stub** (`e2e/*.spec.ts`): loja na porta 3102, sem serviço de decisão nem banco.
- **Com o SDK** (`e2e/sdk/*.spec.ts`, `playwright.sdk.config.ts`): o `e2e/prepare.ts` recria o banco `lever_store_e2e` (migrations, seed e uma key fictícia de `development`); o serviço de decisão sobe na 4102 e a loja na 3102, em modo `sdk`.
- Os fluxos que dependem da avaliação do autor (banner por flag, variantes estáveis, experimento pausado e segmento) ficam pulados até `LEVER_E2E_AUTHOR_READY=1`.
