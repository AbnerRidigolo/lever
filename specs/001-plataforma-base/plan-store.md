# Plano — Spec 001, etapa `store` (worktree de ordem 2)

| Campo    | Valor                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| Spec     | `specs/001-plataforma-base/spec.md`                                          |
| Etapa    | `store` (seção 11, ordem 2)                                                  |
| Worktree | `../lever-store`, branch `feat/store`                                        |
| Status   | Aprovado pelo autor em 03/11/2026 (D1 a D13 aceitas; respostas na seção 8)   |
| Escopo   | `apps/store`, mais os ajustes fora dele listados na seção 3 (D13, aprovação) |

## 0. Observações antes de começar

- **Ordem da spec.** A seção 11 coloca a loja na ordem 2, depois do SDK pronto. O `@lever/sdk` ainda está sendo planejado na worktree `sdk` e não existe nesta branch. Este plano constrói a loja agora, atrás de uma interface pequena (`LeverAdapter`), com um stub no lugar do SDK. A troca pelo SDK real é uma tarefa própria (T12), feita depois que o SDK entrar na `main` (D1).
- **Avaliação reservada.** `packages/evaluation` ainda lança `not implemented`. Mesmo com o SDK pronto, o comportamento real (flag servida pela configuração e variante atribuída por hash) só aparece quando o autor implementar `evaluateFlag` e `evaluateExperiment`. Até lá, a loja mostra os valores padrão (D1, seção 4).
- **Seed.** A loja usa a flag `new-banner` (booleana, padrão `false`, desligada nos dois ambientes) e o experimento `checkout-layout` (`one-page` controle e `multi-step`, 50/50), que roda só em `development`. Por isso a key da loja é de `development` (D5).
- **Sem banco.** O catálogo é um arquivo estático gerado por script, as contas da loja são fictícias e fixas, e o carrinho fica em cookie. A loja não importa `@lever/db` e não cria migration.

## 1. O que esta etapa entrega

A loja de demonstração em Next.js (App Router, Server Components por padrão, mutações por Server Actions), na porta **3002** (E2E na 3102):

- **Vitrine** (`/`): banner da home controlado pela flag `new-banner` (AC-8.2) e grade de produtos, com filtro por categoria.
- **Página de produto** (`/products/[slug]`): nome, descrição, preço e botão "Adicionar ao carrinho".
- **Carrinho** (`/cart`): itens, quantidade, remoção e total (AC-8.1).
- **Checkout fictício** (`/checkout`), com o layout escolhido pelo experimento `checkout-layout` (AC-8.3):
  - `one-page`: dados, entrega e pagamento fictício num único formulário;
  - `multi-step`: as mesmas etapas em três passos (`/checkout?step=1..3`), com revisão no fim.
- **Confirmação** (`/checkout/confirmation`): número fictício do pedido e resumo.
- **Conta fictícia** (`/account`): entrar e sair com uma das contas de demonstração; no login, o id da conta substitui o id anônimo (seção 13, D4).
- **Identificação** (AC-8.4): id anônimo em cookie, criado no `proxy.ts`, e atributos `country` e `device` calculados a cada requisição (D2, D3).
- **Painel do Lever** (rodapé): mostra o id em uso (abreviado), `country`, `device`, o valor de `new-banner` e a variante de `checkout-layout` (só no checkout ou com o painel aberto, `?panel=1`, para não gerar exposição à toa, D9), e deixa trocar a "persona" de demonstração. Serve para a demonstração gravada da seção 12 e para os testes.
- **Avaliação no servidor** (AC-8.5): flags e variantes são avaliadas em Server Components antes de renderizar. O cliente nunca avalia e só recebe o resultado.
- **Observabilidade**: logs com pino, `/metrics` com as métricas do SDK da seção 10 e traces com OpenTelemetry (D8).
- **Catálogo** gerado por seed determinístico (`pnpm --filter @lever/store catalog:generate`), versionado em `src/catalog/products.json` (D11).

Componentes principais: `Header` (logo, link do carrinho com contador, conta), `Banner` e `NewBanner`, `ProductCard`, `ProductGrid`, `AddToCartButton` (cliente, por causa do estado pendente), `CartTable`, `CheckoutOnePage`, `CheckoutMultiStep`, `OrderSummary`, `LeverPanel`, e os componentes de interface (`Button`, `Card`, `Input`, `Select`, `Badge`) escritos à mão no estilo do shadcn, como no console.

**Fora desta etapa:** o SDK (worktree `sdk`), a lógica de avaliação (do autor), o E2E de ponta a ponta console → decisão → loja, o k6 e o dashboard do Grafana (worktree `quality`).

## 2. Versões

Mesma regra das etapas anteriores: versão exata e com pelo menos 2 semanas de publicação (corte em 20/10/2026, consultado com `npm view <pacote> time --json` em 03/11/2026). Reaproveito as versões do console sempre que possível, e as do monorepo: TypeScript 6.0.3, Zod 4.6.7, Vitest 5.0.5, pino 10.3.1, tsx 4.23.15, ESLint 10.12.0 e `@types/node` 24.19.2.

| Pacote                                         | Versão              | Observação                                                        |
| ---------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| next, eslint-config-next                       | 16.4.2              | Publicada em 15/10. A 16.4.3 (23/10) e a 16.4.4 (02/11) são novas |
| react, react-dom                               | 19.3.1              | 14/10                                                             |
| @types/react, @types/react-dom                 | 19.3.0              |                                                                   |
| tailwindcss, @tailwindcss/postcss              | 4.3.3               | A 4.3.4 saiu em 02/11                                             |
| clsx, tailwind-merge, class-variance-authority | 2.1.1, 3.7.0, 0.7.1 | Componentes escritos à mão, como no console                       |
| prom-client                                    | 15.1.3              | Mesma do serviço de decisão, para o `/metrics` (D8)               |
| @opentelemetry/sdk-node e afins                | 0.223.0             | Mesmos pacotes e versão do console (`instrumentation.ts`)         |
| @playwright/test                               | 1.64.1              | 14/10, mesma do console                                           |
| @lever/sdk                                     | `workspace:*`       | Só na T12, depois do SDK na `main` (D1)                           |

Não entram: biblioteca de dados falsos (o gerador do catálogo usa listas de palavras e um PRNG com semente fixa), Auth.js (o login da loja é fictício, D4) e imagens externas (os produtos usam ilustrações SVG geradas, sem rede).

## 3. Decisões que preciso que você aprove

- **D1 — Interface `LeverAdapter` e stub antes do SDK.**
  - **Interface** (`src/lever/adapter.ts`), espelhando a AC-5.1 e a AC-5.2, mas assíncrona e com fallback, para caber tanto no SDK local quanto numa eventual avaliação remota:
    ```ts
    export interface LeverAdapter {
      getFlag<T extends FlagValue>(key: string, user: UserContext, defaultValue: T): Promise<T>;
      getVariant(key: string, user: UserContext, fallbackVariant: string): Promise<string>;
      /** Seconds since the last valid configuration; null when there is none (stub). */
      configAgeSeconds(): number | null;
    }
    ```
    `FlagValue` e `UserContext` vêm de `@lever/schemas`. As páginas nunca importam o SDK nem o stub: usam `getLever()` (`src/lever/index.ts`), que devolve a implementação escolhida, envolvida por um decorador que conta avaliações (D8), registra exposições (D9) e nunca deixa uma exceção chegar à página (seção 4).
  - **O que o stub faz** (`src/lever/stub-adapter.ts`, `LEVER_ADAPTER=stub`): não faz rede, não lê o banco e **não calcula hash nem bucket** (isso é do autor). `getFlag` devolve o `defaultValue`; `getVariant` devolve o `fallbackVariant` (o controle, `one-page`). Os dois aceitam sobrescritas para demonstração e testes:
    - `LEVER_STUB_OVERRIDES` (JSON validado com Zod, por exemplo `{"flags":{"new-banner":true},"experiments":{"checkout-layout":"multi-step"}}`), que vale para todos;
    - o cookie `lever_stub_overrides`, no mesmo formato, que vale só para aquele navegador. Ele só é lido com `LEVER_ADAPTER=stub`, e o Painel do Lever mostra os botões para ligá-lo. É o que os E2E usam para ver as duas variantes.
    - `getVariant` emite a exposição com `configVersion: 1` (o mínimo aceito por `configVersionSchema`) e `configAgeSeconds()` devolve `null`.
  - **A troca (T12):** quando o SDK estiver na `main`, faço rebase, adiciono `@lever/sdk: workspace:*`, crio `src/lever/sdk-adapter.ts` (cliente único, inicializado uma vez por processo e guardado em `globalThis` para sobreviver ao HMR do `next dev`), mapeio `getFlag`, `getVariant`, `onExposure` e a idade da configuração, e mudo o padrão de `LEVER_ADAPTER` para `sdk`. Nenhuma página muda. O stub continua no código para os testes e para rodar a loja sem o serviço de decisão.
  - **Quando abrir o PR. Proposta:** desenvolver T1 a T11 agora e só abrir o PR depois do SDK na `main`, já com a T12, respeitando a ordem da seção 11. Se o SDK atrasar, a alternativa é abrir o PR com o stub e fazer a T12 num PR pequeno depois. Qual você prefere?
  - **Alinhamento com a worktree `sdk`:** a T12 assume que o SDK expõe `getFlag(key, user, default)`, `getVariant(key, user)`, o hook `onExposure` e alguma forma de ler a idade da configuração (para a métrica da seção 10). Se o plano do SDK definir outra forma, só o `sdk-adapter.ts` muda.
- **D2 — `country` e `device`.**
  - **`device`:** derivado do `User-Agent`: `mobile` (`Mobi`, `Android` com `Mobile`, `iPhone`), `tablet` (`iPad`, `Tablet`, `Android` sem `Mobile`) e `desktop` no resto, inclusive sem `User-Agent`.
  - **`country`:** a região da primeira língua do `Accept-Language` com região (`pt-BR` → `BR`), em maiúsculas e validada como duas letras. Sem região, o atributo fica **ausente** do contexto, e pela AC-4.4 ele nunca casa com uma regra. Não uso geolocalização por IP, que exigiria um serviço externo.
  - **Persona de demonstração:** o Painel do Lever deixa escolher `country` (BR, US, PT, AR, ou "automático") e `device` (mobile, tablet, desktop, ou "automático"). A escolha fica no cookie `lever_persona` (Zod, `httpOnly`, `SameSite=Lax`, 30 dias) e tem precedência sobre os cabeçalhos. Serve para mostrar segmentos (`country = BR` e `device in [mobile]`) sem trocar de navegador.
  - Os atributos não ficam no cookie do id: são recalculados a cada requisição.
- **D3 — Cookie do id anônimo.**
  - Nome `lever_uid`, valor `crypto.randomUUID()` validado com `z.uuid()`; valor ausente ou inválido gera um novo.
  - `Max-Age` de 365 dias, `Path=/`, `HttpOnly` (o navegador não precisa do id, porque a avaliação é no servidor), `SameSite=Lax` e `Secure` só com `NODE_ENV=production` (o local é `http`).
  - **Onde é criado:** em `src/proxy.ts` (o `middleware` renomeado no Next 16). Server Components não podem gravar cookies, então o proxy grava o cookie na resposta **e** o injeta nos cabeçalhos da própria requisição. Assim a primeira visita já é avaliada com o mesmo id que o navegador vai guardar, sem uma segunda requisição e sem trocar de variante no primeiro clique.
- **D4 — Login fictício e troca de id.**
  - **Contas:** uma lista fixa em `src/accounts/accounts.ts` com 4 contas de demonstração (nomes fictícios, ids `store-account-0001` a `0004`, sem e-mail nem senha). Não toca na tabela `users` do console nem cria migration.
  - **Entrar:** em `/account`, o usuário escolhe uma conta e confirma; a Server Action valida o id com Zod contra a lista e grava o cookie `lever_account` (`httpOnly`, `SameSite=Lax`, sessão de 7 dias). O valor é assinado com HMAC-SHA-256 e a variável `STORE_SESSION_SECRET` (Q2); assinatura inválida vale como "sem conta".
  - **Troca do id (seção 13):** com `lever_account` válido, o `UserContext.id` passa a ser o id da conta; sem ele, é o `lever_uid`. O `lever_uid` não é apagado no login, então ao sair o usuário volta ao id anônimo anterior e às variantes que tinha. Consequência já aceita na spec: a variante pode mudar no login.
  - Carrinho e persona continuam iguais no login e no logout.
- **D5 — API key e ambiente.**
  - Variáveis novas, validadas com Zod em `src/server/env.ts`: `LEVER_ADAPTER` (`stub` ou `sdk`; padrão `stub` até a T12, `sdk` depois), `LEVER_DECISION_URL` (padrão `http://localhost:4000`), `LEVER_API_KEY` (obrigatória quando `LEVER_ADAPTER=sdk`), `LEVER_STUB_OVERRIDES` (opcional), `STORE_SESSION_SECRET` (pelo menos 16 caracteres, Q2) e `STORE_PORT` (padrão 3002).
  - A key é de **`development`**, porque o `checkout-layout` só está `running` lá no seed. Ela é criada pelo console (página de API keys) ou por `pnpm --filter @lever/decision api-key:create -- --env development --name store`, e copiada para o `.env`. A key nunca vai para o cliente nem para os logs.
  - O E2E com o SDK real cria a própria key no banco de E2E (no `e2e/prepare.ts`, com `generateApiKey` de `@lever/db`, só como dependência de desenvolvimento), como o console já faz com o banco `lever_e2e`.
- **D6 — Sem piscar a variante e sem cache.**
  - Toda página que avalia lê `cookies()` e `headers()`, o que já a torna dinâmica no Next 16. Não ligo `cacheComponents` nem uso `"use cache"` em nada que dependa do usuário, e as páginas que avaliam também exportam `dynamic = 'force-dynamic'` para deixar a intenção explícita.
  - A variante é decidida no Server Component antes de renderizar e escolhe qual componente vai para o HTML. O componente da variante errada nunca chega ao navegador. Não há avaliação no cliente nem `Suspense` com um layout provisório em volta do checkout.
  - Componentes cliente recebem a variante só como prop, quando precisam.
  - Respostas dinâmicas saem com `Cache-Control: private, no-store` (o padrão do Next para páginas dinâmicas), então nenhum proxy reaproveita a página de outro usuário.
  - As páginas de produto também são dinâmicas, por causa do contador do carrinho no cabeçalho. O custo é pequeno na demonstração.
- **D7 — Carrinho em cookie.** **Proposta:** cookie `lever_cart` com JSON `[{ productId, quantity }]`, validado com Zod na leitura (valor inválido vira carrinho vazio), no máximo 20 linhas e quantidade de 1 a 10, `httpOnly`, `SameSite=Lax`, 30 dias. As mudanças são Server Actions. Sobrevive a reinícios e ao HMR, e não exige estado no servidor. A alternativa, um `Map` em memória por id, perde o carrinho a cada reinício e não funciona com mais de uma instância.
- **D8 — Métricas e traces.**
  - A seção 10 pede que a loja exponha as métricas do SDK. **Proposta:** rota `GET /metrics` (`src/app/metrics/route.ts`) com prom-client, num registro próprio guardado em `globalThis`:
    - `lever_sdk_evaluations_total{kind="flag"|"variant", key}`: contador incrementado pelo decorador do adaptador. "Avaliações por segundo" é o `rate()` dele no Prometheus.
    - `lever_sdk_config_age_seconds`: gauge lido de `configAgeSeconds()` na coleta; com o stub, fica sem valor.
    - `lever_sdk_evaluation_errors_total{kind}`: erros que o decorador engoliu e trocou pelo padrão (seção 4).
    - as métricas padrão do processo Node.
  - Se o SDK já trouxer suas próprias métricas no prom-client, uso as dele na T12 e removo as duplicadas.
  - `prom-client` entra em `serverExternalPackages`, como `pino` e o OpenTelemetry.
  - Traces: `instrumentation.ts` igual ao do console, ativado por `OTEL_EXPORTER_OTLP_ENDPOINT`, com `OTEL_SERVICE_NAME=lever-store`.
  - O scrape no Prometheus muda um arquivo compartilhado (D13). O painel no Grafana fica para a `quality`.
- **D9 — Hook de exposição.** O decorador registra cada exposição (AC-5.7) com pino, nível `info`, mensagem `exposure` e os campos `experimentKey`, `variantKey`, `configVersion` e `timestamp`, validados com `exposureEventSchema`. O `userId` **não** vai para o log (AGENTS.md: sem dados pessoais; o serviço de decisão também não registra o id). A variante só é pedida onde é usada (páginas de checkout e o Painel do Lever com `?panel=1`), para não registrar exposição de quem nunca viu o checkout. Sem deduplicação nesta fase: a spec 002 liga o hook ao coletor e decide isso.
- **D10 — Portas.** Loja em **3002** (`next dev --port 3002` e `next start --port 3002`). No E2E, loja em **3102** e, quando precisar do SDK real, serviço de decisão em **4100**, como no console.
- **D11 — Catálogo estático gerado por seed.**
  - Script `scripts/generate-catalog.ts` (`pnpm --filter @lever/store catalog:generate`), com PRNG de semente fixa (mulberry32) e listas de palavras em português, gera 24 produtos fictícios em 4 categorias: `id`, `slug`, `name`, `description`, `category`, `priceCents` (BRL) e a cor e o ícone da ilustração SVG.
  - O resultado fica versionado em `src/catalog/products.json` e é validado com Zod no carregamento (`src/catalog/schema.ts`). Rodar o script de novo gera o mesmo arquivo, e um teste garante isso.
  - O schema do produto fica na loja, e não em `packages/schemas`, porque não é um contrato entre pacotes: só a loja o usa. Se preferir lá, é uma mudança num pacote compartilhado.
- **D12 — Interface.** Textos em português e preços em BRL, sem biblioteca de tradução, como na D11 do console. Componentes escritos à mão no estilo do shadcn, com Tailwind e `cva`.
- **D13 — Arquivos fora de `apps/store`** (precisam da sua autorização):
  - `.env.example`: as variáveis da D5, com valores fictícios e a key comentada;
  - `turbo.json`: `LEVER_ADAPTER`, `LEVER_DECISION_URL`, `LEVER_API_KEY` e `LEVER_STUB_OVERRIDES` em `globalEnv`, para o cache do Turborepo não reaproveitar um build com outra configuração;
  - `infra/prometheus/prometheus.yml`: job `store` em `host.docker.internal:3002`;
  - `.github/workflows/ci.yml`: o job de E2E passa a se chamar "E2E" e a enviar também `apps/store/test-results/` nos artefatos. O Chromium já instalado pelo console serve à loja (mesma versão do Playwright), e o `pnpm test:e2e` da raiz já roda o `test:e2e` de todos os pacotes;
  - `README.md` da raiz e `apps/store/README.md`: como subir a loja, criar a key e usar o Painel do Lever.

  Nenhuma mudança em `packages/schemas`, `packages/db`, `packages/evaluation` ou `packages/sdk`.

## 4. Regras de comportamento

São escolhas onde a spec não é explícita. Me corrija se alguma estiver errada.

- **Contexto do usuário:** montado uma vez por requisição em `getUserContext()` (`src/server/user.ts`, com `React.cache`): `{ id, attributes: { country?, device } }`, validado com `userContextSchema`. O id vem da conta (D4) ou do `lever_uid` (D3).
- **Nunca quebrar a página:** o decorador do adaptador captura qualquer exceção (inclusive o `not implemented` da avaliação do autor), registra o erro sem dados do usuário, incrementa `lever_sdk_evaluation_errors_total` e devolve o padrão da flag ou o controle. É o que a AC-5.5 pede ao SDK; a loja repete a garantia na própria fronteira.
- **Valor inesperado:** o valor de `new-banner` é validado com `z.boolean()`; qualquer outro tipo vira `false`. Uma variante de `checkout-layout` desconhecida pela loja (por exemplo, uma terceira variante criada no console) renderiza o controle `one-page` e registra um aviso. A exposição registra a variante que o SDK devolveu, não a renderizada, e o aviso deixa a diferença visível.
- **Banner (AC-8.2):** `new-banner = true` mostra o banner novo; `false` mostra o banner padrão. Nos dois casos existe um banner, então a home não muda de altura. O atributo `data-banner="new|default"` serve aos testes.
- **Tempo de propagação (AC-1.1 e AC-1.2):** "a loja passa a exibir em até 5 segundos" é lido como "uma nova requisição, feita até 5 s depois da mudança no console, já vem com o novo valor". Uma página já aberta só muda ao recarregar: o SDK é só de servidor nesta fase (seção 13) e não há push para o navegador. Se você quiser atualização sem recarregar, é uma decisão nova (por exemplo `router.refresh()` periódico na home).
- **Checkout (AC-8.3):**
  - a variante é avaliada a cada requisição de `/checkout`; o atributo `data-checkout-layout="one-page|multi-step"` vai na raiz do formulário;
  - no `multi-step`, os dados de cada passo ficam no cookie `lever_checkout` (Zod, `httpOnly`, 1 hora) e `?step=` fora de ordem volta ao primeiro passo incompleto;
  - se a variante mudar no meio do fluxo (experimento pausado, login), o usuário vai para o início do layout novo, com os dados já preenchidos aproveitados;
  - carrinho vazio redireciona para `/cart`.
- **Pedido fictício:** a Server Action valida nome, endereço fictício e forma de pagamento (`pix`, `boleto` ou `cartao-teste`, **sem campos de cartão**), gera o número `LV-` mais 8 caracteres aleatórios, guarda um resumo no cookie `lever_last_order` (10 minutos), limpa carrinho e checkout e redireciona para a confirmação. Nada é persistido, e nome e endereço não vão para os logs. O log registra só `order_completed` com número do pedido, total, quantidade de itens e a variante, já pensando na spec 002.
- **Login trocando a variante:** aceito pela spec; o Painel do Lever mostra o id em uso para tornar isso visível na demonstração.
- **Cookies:** todo cookie lido passa por Zod; valor inválido é descartado e recriado, sem erro para o usuário.
- **Erros:** página `error.tsx` genérica, sem detalhes internos; `not-found.tsx` para produto inexistente. A loja não tem API pública além de `/metrics`, então o formato de `@lever/schemas/errors` só é usado se surgir uma Route Handler.
- **Logs:** pino com `service: 'lever-store'`; nunca registram id do usuário, id da conta, atributos, conteúdo do carrinho com dados pessoais, nome, endereço ou a API key.

## 5. Tarefas e commits

Todas na branch `feat/store`, em Conventional Commits, sem atribuição a IA. Cada commit de T2 a T11 traz os próprios testes.

| #   | Commit                                                   | Arquivos principais (em `apps/store`, salvo indicação)                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | `docs: add store worktree plan`                          | `specs/001-plataforma-base/plan-store.md`                                                                                                                                                                                                                                                                                                                                |
| T2  | `feat(store): scaffold next app`                         | `package.json` (`@lever/store`, scripts `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e`, `catalog:generate`), `tsconfig.json`, `eslint.config.js`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `src/app/{layout,not-found,error}.tsx`, `src/app/globals.css`, `src/server/{env,logger}.ts`, `src/components/ui.tsx`, `src/lib/utils.ts` |
| T3  | `feat(store): generate fictitious product catalog`       | `scripts/generate-catalog.ts`, `src/catalog/{schema,catalog}.ts`, `src/catalog/products.json`, `src/components/product-illustration.tsx`, `test/catalog.test.ts` (D11)                                                                                                                                                                                                   |
| T4  | `feat(store): identify users with cookie and attributes` | `src/proxy.ts`, `src/server/{cookies,user,attributes}.ts`, `test/{attributes,user,proxy}.test.ts` (D2, D3)                                                                                                                                                                                                                                                               |
| T5  | `feat(store): add lever adapter with stub`               | `src/lever/{adapter,stub-adapter,decorate,index}.ts`, `test/{stub-adapter,decorate}.test.ts` (D1, D9, seção 4)                                                                                                                                                                                                                                                           |
| T6  | `feat(store): add storefront and product pages`          | `src/app/page.tsx`, `src/app/products/[slug]/page.tsx`, `src/components/{header,banner,product-card,product-grid}.tsx`, `test/banner.test.ts` (AC-8.2)                                                                                                                                                                                                                   |
| T7  | `feat(store): add cart`                                  | `src/server/cart.ts`, `src/app/actions/cart.ts`, `src/app/cart/page.tsx`, `src/components/{add-to-cart-button,cart-table}.tsx`, `test/cart.test.ts` (D7)                                                                                                                                                                                                                 |
| T8  | `feat(store): add checkout experiment`                   | `src/server/checkout.ts`, `src/app/actions/checkout.ts`, `src/app/checkout/page.tsx`, `src/app/checkout/confirmation/page.tsx`, `src/components/{checkout-one-page,checkout-multi-step,order-summary}.tsx`, `test/checkout.test.ts` (AC-8.3)                                                                                                                             |
| T9  | `feat(store): add fictitious accounts and lever panel`   | `src/accounts/accounts.ts`, `src/app/actions/{account,persona,stub-overrides}.ts`, `src/app/account/page.tsx`, `src/components/lever-panel.tsx`, `test/{account,persona}.test.ts` (D2, D4)                                                                                                                                                                               |
| T10 | `feat(store): expose sdk metrics and traces`             | `src/server/metrics.ts`, `src/app/metrics/route.ts`, `src/instrumentation.ts`, `test/metrics.test.ts` (D8)                                                                                                                                                                                                                                                               |
| T11 | `test(store): add e2e flows with the stub adapter`       | `playwright.config.ts`, `e2e/{env,helpers}.ts`, `e2e/{shopping,banner,checkout,identity,no-flicker}.spec.ts`; fora da loja (D13): `.env.example`, `turbo.json`, `infra/prometheus/prometheus.yml`, `.github/workflows/ci.yml`, `README.md`, `apps/store/README.md`                                                                                                       |
| T12 | `feat(store): switch to the lever sdk`                   | **Depois do SDK na `main`.** `package.json` (`@lever/sdk`), `src/lever/sdk-adapter.ts`, padrão `LEVER_ADAPTER=sdk`, `e2e/prepare.ts` (banco de E2E e key), `e2e/sdk/*.spec.ts`, `test/sdk-adapter.test.ts` (D1)                                                                                                                                                          |

A T11 pode ser dividida em `test(store): ...` e `chore: wire store into env, metrics and ci` se você preferir separar os arquivos compartilhados. Verificação final: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` e `pnpm --filter @lever/store test:e2e`.

## 6. Testes

Unitários com Vitest (a loja não usa banco, então não há Testcontainers). E2E com Playwright e o build de produção (`next start --port 3102`).

| Teste                                | O que verifica                                                                                                                                             | Cobre                  | Roda com    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------- |
| `catalog.test.ts`                    | Todos os produtos passam no schema, slugs únicos, regenerar dá o mesmo arquivo                                                                             | AC-8.1                 | agora       |
| `attributes.test.ts`                 | `device` pelo `User-Agent` (mobile, tablet, desktop, ausente); `country` pelo `Accept-Language` (com e sem região, inválido); persona tem precedência      | AC-8.4                 | agora       |
| `user.test.ts`                       | Id anônimo sem conta, id da conta com login, volta ao anônimo no logout; contexto válido pelo `userContextSchema`                                          | AC-8.4, seção 13       | agora       |
| `proxy.test.ts`                      | Cria `lever_uid` com as flags da D3, injeta na requisição, mantém um cookie válido e troca um inválido                                                     | AC-8.4, AC-8.5         | agora       |
| `stub-adapter.test.ts`               | Padrão e controle sem sobrescrita, sobrescritas por env e cookie, cookie ignorado fora do modo stub, exposição emitida                                     | AC-8.2, AC-8.3 (stub)  | agora       |
| `decorate.test.ts`                   | Exceção vira padrão e conta erro; valor de tipo errado vira `false`; variante desconhecida vira controle; log de exposição sem `userId`                    | AC-8.5, AC-5.7 (loja)  | agora       |
| `banner.test.ts`                     | A home renderiza `data-banner="new"` com a flag ligada e `default` desligada                                                                               | AC-8.2                 | agora       |
| `cart.test.ts`                       | Adicionar, somar, limite de quantidade e linhas, remover, cookie inválido vira vazio, total                                                                | AC-8.1                 | agora       |
| `checkout.test.ts`                   | Escolha do layout pela variante, passos do `multi-step`, troca de variante no meio, validação do pedido, carrinho vazio                                    | AC-8.1, AC-8.3         | agora       |
| `account.test.ts`, `persona.test.ts` | Login só com conta da lista, cookies validados, persona aplicada                                                                                           | AC-8.4, seção 13       | agora       |
| `metrics.test.ts`                    | `/metrics` expõe avaliações, erros e idade da configuração                                                                                                 | seção 10               | agora       |
| `e2e/shopping.spec.ts`               | Vitrine → produto → carrinho → checkout → confirmação                                                                                                      | AC-8.1                 | agora       |
| `e2e/banner.spec.ts`                 | Com a sobrescrita do stub, a home mostra o banner novo; sem ela, o padrão                                                                                  | AC-8.2 (stub)          | agora       |
| `e2e/checkout.spec.ts`               | Com a sobrescrita, cada layout aparece e conclui o pedido                                                                                                  | AC-8.3 (stub)          | agora       |
| `e2e/identity.spec.ts`               | `lever_uid` criado na primeira visita (`HttpOnly`, `SameSite=Lax`, 365 dias), o mesmo id nas visitas seguintes, login troca o id e logout volta ao anônimo | AC-8.4, seção 13       | agora       |
| `e2e/no-flicker.spec.ts`             | Com JavaScript desligado e no HTML bruto da primeira resposta, só o layout e o banner certos estão presentes, inclusive na primeira visita (sem cookie)    | AC-8.5                 | agora       |
| `e2e/sdk/banner.spec.ts`             | Publicar `new-banner` ligada no banco de E2E faz uma nova requisição da loja mostrar o banner novo em menos de 5 s; desligar volta ao padrão               | AC-8.2, AC-1.1, AC-1.2 | SDK + autor |
| `e2e/sdk/checkout.spec.ts`           | Dois navegadores com ids diferentes caem em variantes estáveis em várias visitas; com o experimento pausado, os dois veem `one-page`                       | AC-8.3, AC-3.3, AC-3.5 | SDK + autor |
| `e2e/sdk/segment.spec.ts`            | Um segmento `country = BR` aplicado à flag só liga o banner com a persona BR                                                                               | AC-4.3, AC-8.4         | SDK + autor |

**Agora** = roda com o stub, sem serviço de decisão nem banco. **SDK + autor** = precisa do `@lever/sdk` (T12), do serviço de decisão na 4100 com Postgres e, para dar o resultado esperado, das funções do autor em `packages/evaluation`. Até lá esses arquivos ficam com `test.skip` condicionado a `LEVER_ADAPTER=sdk` e a uma variável `LEVER_E2E_AUTHOR_READY`, para não quebrar a CI. A demonstração completa console → loja continua com a `quality`.

## 7. Requisitos que esta etapa não fecha

- **AC-8.2 e AC-8.3 com o Lever de verdade:** com o stub, a loja prova o fluxo e a ausência de piscar, mas o valor vem da sobrescrita. Fecham com a T12 e a avaliação do autor.
- **AC-1.1 e AC-1.2 de ponta a ponta (console → decisão → SDK → loja) e NFR-003:** dependem do SDK e da avaliação; o teste final fica com a `quality`.
- **AC-5.x:** são do SDK. A loja só garante a própria fronteira (padrão em caso de erro, log de exposição).
- **Dashboard do Grafana com as métricas da loja:** worktree `quality`.
- **Atualização sem recarregar a página:** fora, salvo decisão nova (seção 4).

## 8. Dúvidas respondidas (03/11/2026)

- **Q1:** o PR só é aberto depois do SDK na `main`, já com a T12. Nada é enviado ao GitHub antes disso. (D1)
- **Q2:** sim, o cookie de conta é assinado com HMAC e `STORE_SESSION_SECRET`, validada com Zod e com valor fictício no `.env.example`. (D4)
- **Q3:** sim, "até 5 segundos" é na próxima carga da página. (seção 4)
- **API do SDK** (plano da worktree `sdk`): `createLeverClient({ apiKey, baseUrl, logger? })`, `ready({ timeoutMs })` → `'ready' | 'timeout' | 'closed'`, `getFlag(key, user, default)` (nunca lança), `getVariant(key, user)` → `string | null`, `onExposure(listener)` → função de cancelamento, `getMetrics()` (contadores monotônicos e `configAgeMs`) e `close()`. A interface `LeverAdapter` fica como está; o `sdk-adapter.ts` da T12 converte `configAgeMs` em segundos e `null` no fallback.
