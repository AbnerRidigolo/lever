# Plano — Spec 001, etapa `console` (worktree de ordem 1)

| Campo    | Valor                                                                 |
| -------- | --------------------------------------------------------------------- |
| Spec     | `specs/001-plataforma-base/spec.md`                                   |
| Etapa    | `console` (seção 11, ordem 1)                                         |
| Worktree | `../lever-console`, branch `feat/console`                             |
| Status   | Aguardando aprovação do autor                                         |
| Escopo   | `apps/console`, mais os ajustes fora dele listados na seção 3 (D2–D4) |

## 1. O que esta etapa entrega

O console do Lever em Next.js (App Router, Server Components por padrão, mutações por Server Actions):

- Login por link mágico e GitHub (AC-7.1) e papéis `admin`, `editor` e `viewer` (AC-7.2).
- Projetos, com `development` e `production` criados juntos (FR-001), e gestão de membros.
- CRUD de flags, com valor validado pelo tipo e configuração por ambiente (AC-1.4, FR-002).
- CRUD de experimentos, com variantes, pesos e estados (AC-3.1, AC-3.5, AC-3.6, FR-003).
- CRUD de segmentos com editor de regras (AC-4.1 a AC-4.3).
- API keys por ambiente, com a key completa exibida uma única vez (AC-7.3).
- Histórico de auditoria filtrável, e histórico e "onde está ativo" em cada flag e experimento (AC-6.1, AC-6.2, FR-009, FR-010).
- Publicação: toda mudança grava a auditoria e a nova versão de configuração na mesma transação. O trigger da `base` avisa o serviço de decisão (FR-008).

**Fora desta etapa:** atribuição e avaliação (do autor), SDK, loja, k6 e dashboard do Grafana. A AC-1.1 só fecha de ponta a ponta com a loja e o SDK.

## 2. Versões

Mesma regra das etapas anteriores: versão exata e com pelo menos 2 semanas de publicação (corte em 16/10/2026). Também valem as versões já usadas no monorepo.

| Pacote                                         | Versão              | Observação                                                                     |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| next, eslint-config-next                       | 16.4.2              | A 16.4.3 saiu depois do corte                                                  |
| react, react-dom                               | 19.3.1              |                                                                                |
| @types/react, @types/react-dom                 | 19.3.0              |                                                                                |
| next-auth                                      | 5.0.0-beta.32       | **Beta**, ver D1. Aceita Next 16                                               |
| @auth/drizzle-adapter                          | 1.11.3              | Usa o mesmo `@auth/core` 0.41.3 da v5                                          |
| nodemailer                                     | última 8.x          | A v5 aceita `^7 \|\| ^8`, então a 10.x fica de fora. Fixo a versão exata na T1 |
| tailwindcss, @tailwindcss/postcss              | 4.3.3               |                                                                                |
| shadcn (CLI, só para gerar componentes)        | 4.21.5              | A ideação pede shadcn/ui                                                       |
| radix-ui                                       | 1.8.1               |                                                                                |
| lucide-react                                   | 1.57.0              |                                                                                |
| clsx, tailwind-merge, class-variance-authority | 2.1.1, 3.7.0, 0.7.1 |                                                                                |
| @playwright/test                               | 1.64.1              | E2E                                                                            |
| Imagem `axllent/mailpit`                       | `v1.31.6`           | Caixa de e-mail local, ver D3                                                  |

## 3. Decisões que preciso que você aprove

- **D1 — Auth.js v5, que ainda é beta.** A spec (ADR-005) pede Auth.js. A estável é a `next-auth` 4, mas ela fixa um `@auth/core` antigo, diferente do adapter do Drizzle, e foi feita para o Pages Router. **Proposta:** usar a v5 na versão exata `5.0.0-beta.32`. O risco é mudança de API entre betas; com a versão fixada, só muda quando atualizarmos.
- **D2 — Migration (`0003`), a única desta fase, como combinado na seção 13.**
  - Cria `accounts`, `sessions` e `verification_tokens` no formato do adapter, e adiciona `users.email_verified`.
  - O adapter espera o campo `image` e a spec define `avatar_url`. **Proposta:** manter a coluna `avatar_url` e, na tabela Drizzle, mudar só a propriedade TypeScript `avatarUrl` para `image`. O seed e os testes acompanham a mudança; o banco não muda.
  - Sessões ficam no banco, para que remover um membro ou encerrar uma sessão valha na hora. Isso altera `packages/db`.
- **D3 — Mailpit no compose.** O link mágico precisa de um servidor SMTP. **Proposta:** adicionar Mailpit (SMTP na 1025, caixa de entrada web na 8025) ao `infra/docker-compose.yml`, e novas variáveis ao `.env.example`: `AUTH_SECRET`, `AUTH_URL`, `EMAIL_SERVER`, `EMAIL_FROM`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`. O botão do GitHub só aparece com as duas últimas definidas. Para testar o login com GitHub de verdade, você precisa criar um OAuth App na sua conta.
- **D4 — Mudanças em `packages/schemas`.** Acrescento schemas de entrada que o console precisa: membro (e-mail e papel), criação de projeto e de API key, transição de estado do experimento e filtros da auditoria. Só acrescento, sem alterar os contratos existentes.
- **D5 — Quem pode entrar.** **Proposta:** só e-mails já cadastrados. O admin adiciona um membro pelo e-mail, o que cria o usuário, e o login recusa quem não está em `users`. Sem isso, qualquer pessoa com o endereço do console criaria conta. O primeiro acesso é o `admin@lever.local` do seed, com o link lido no Mailpit.
- **D6 — Mesmo e-mail no GitHub e no link mágico.** **Proposta:** vincular as duas formas de login à mesma conta quando o e-mail for igual (`allowDangerousEmailAccountLinking`). O GitHub só é aceito com e-mail verificado, e o cadastro prévio da D5 limita quem entra. A alternativa é contas separadas, o que atrapalharia quem usa os dois métodos.
- **D7 — O 403 da AC-7.2 com Server Actions.** A spec pede que a API recuse com 403, mas por padrão uma Server Action responde 200, e o AGENTS.md exige Server Actions nas mutações. **Proposta:** usar `forbidden()` do Next, que responde 403 de verdade, mas exige ligar a opção experimental `authInterrupts`. A T4 traz um teste E2E que forja a chamada e confere o status. Se não responder 403 numa Server Action, paro e te aviso em vez de improvisar.
- **D8 — Estados do experimento** (a spec lista os estados, mas não as transições).
  - **Transições por ambiente:** `draft → running`, `running ⇄ paused`, `running ou paused → completed`. `completed` é final.
  - **`experiments.status` (geral):** derivado dos ambientes, na ordem `running`, `paused`, `completed`, `draft`, quando houver ao menos um ambiente naquele estado. `completed` só vale se todos estiverem concluídos ou em rascunho.
  - **Datas:** `started_at` na primeira vez em `running`, `ended_at` quando o geral vira `completed`.
  - **AC-3.6:** variantes e pesos só mudam sem nenhum ambiente em `running`. Ao editar depois de ter rodado, o console mostra o aviso de que isso invalida a análise. Um experimento `completed` não pode ser editado nem reaberto.
- **D9 — Regras de edição.** Chave, tipo e salt de uma flag e chave e salt de um experimento não mudam depois de criados, porque mudar alteraria a atribuição dos usuários. Apagar um segmento em uso mostra onde ele é usado. O projeto sempre precisa de ao menos um admin.
- **D10 — Observabilidade.** O AGENTS.md pede `/metrics` para "todo serviço", e a seção 10 da spec só lista métricas da decisão e do SDK. **Proposta:** logs com pino e traces com OpenTelemetry (`instrumentation.ts`, ativado por `OTEL_EXPORTER_OTLP_ENDPOINT`), sem `/metrics` no console.
- **D11 — Idioma da interface.** O AGENTS.md define inglês para código e português para documentos, mas não fala da interface. **Proposta:** textos em português, sem biblioteca de tradução.
- **D12 — E2E na CI.** **Proposta:** novo job de Playwright só com o Chromium, para os fluxos desta etapa. Ele sobe Postgres e Mailpit como serviços do job. Os fluxos de ponta a ponta com loja e SDK continuam na `quality`.

## 4. Regras de comportamento

- **Autorização:** toda Server Action e toda leitura passam por `requireRole(projectId, papel)`, que confere a sessão e a filiação ao projeto. Quem não é membro recebe 404, para não revelar que o projeto existe. A interface esconde os botões de edição, mas a segurança está no servidor.
- **Permissões:**
  - `viewer` só lê;
  - `editor` altera flags, experimentos e segmentos;
  - `admin` também gerencia membros, API keys e projeto.
- **Transação única (FR-009):** cada mutação valida com Zod, aplica a mudança, grava `audit_log` com antes e depois, e insere a próxima versão nos ambientes afetados. Se qualquer passo falhar, nada é gravado.
- **Versões:** a transação bloqueia a linha do ambiente com `FOR UPDATE` antes de calcular `max(version) + 1`, para duas edições simultâneas não colidirem. Uma mudança de flag em um ambiente publica só esse ambiente (AC-1.3). Mudanças de definição, como segmentos ou variantes, publicam os dois.
- **Rollout e pesos:** a tela usa porcentagem e o banco guarda pontos-base.
- **Criação de flag ou experimento:** gera o salt com `randomBytes` e cria as linhas de configuração nos dois ambientes, desligadas ou em `draft`.
- **API keys:** usam `generateApiKey` de `@lever/db`. A auditoria guarda nome e prefixo, nunca a key nem o hash. Revogar preenche `revoked_at`; a key não é apagada.
- **Auditoria:** só leitura na interface, com filtros por recurso, autor e período, e paginação. Membros e projetos não geram auditoria, porque a AC-6.1 e o enum atual não os incluem.
- **Logs:** nunca registram e-mail, key ou conteúdo de regras, só IDs.

## 5. Tarefas e commits

Commits em Conventional Commits, sem atribuição ao Claude.

| #   | Commit                                                       | Conteúdo principal                                                                                                |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| T1  | `feat(console): scaffold next app`                           | Next, Tailwind, shadcn/ui, tsconfig com `moduleResolution: bundler`, ESLint, env validada com Zod, logger, layout |
| T2  | `feat(db): add auth tables`                                  | Migration `0003`, renomeação da propriedade `image`, testes (D2)                                                  |
| T3  | `feat(infra): add mailpit for local email`                   | Compose, `.env.example`, README (D3)                                                                              |
| T4  | `feat(console): add authentication and roles`                | Auth.js, tela de login, `requireRole`, `forbidden()`, E2E do 403 (D5–D7)                                          |
| T5  | `feat(schemas): add console input schemas`                   | Schemas da D4, com testes                                                                                         |
| T6  | `feat(console): add mutation core with audit and publishing` | `src/server/mutation.ts`: transação, auditoria e versão; testes de rollback e concorrência                        |
| T7  | `feat(console): manage projects and members`                 | Telas e actions                                                                                                   |
| T8  | `feat(console): manage segments`                             | Editor de regras e bloqueio ao apagar em uso                                                                      |
| T9  | `feat(console): manage flags`                                | Formulário por tipo, configuração por ambiente, rollout                                                           |
| T10 | `feat(console): manage experiments`                          | Variantes, pesos, estados e aviso da AC-3.6                                                                       |
| T11 | `feat(console): manage api keys`                             | Criar, exibir uma vez e revogar                                                                                   |
| T12 | `feat(console): add audit history`                           | Lista filtrável, histórico e "onde está ativo" por recurso                                                        |
| T13 | `feat(console): instrument with opentelemetry`               | `instrumentation.ts` (D10)                                                                                        |
| T14 | `ci: run console e2e tests`                                  | Job de Playwright, script `test:e2e` na raiz (D12)                                                                |

## 6. Testes

Integração com Vitest e Postgres real via Testcontainers, chamando a camada de servidor. E2E com Playwright, com o serviço rodando, Postgres e Mailpit.

| Teste                   | O que verifica                                                                               | Cobre                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `flags.test.ts`         | Valor conforme o tipo, chave única, ambientes independentes, rollout em pontos-base          | AC-1.3, AC-1.4, FR-002                      |
| `experiments.test.ts`   | 2 a 5 variantes, soma de 100%, transições, bloqueio em `running`                             | AC-3.1, AC-3.5, AC-3.6, FR-003              |
| `segments.test.ts`      | Regras e operadores, vínculo com flag e experimento, apagar em uso                           | AC-4.1, AC-4.2, AC-4.3                      |
| `mutation.test.ts`      | Falha no meio não grava nada, versão incrementa, edições simultâneas não colidem, NOTIFY sai | FR-008, FR-009                              |
| `audit.test.ts`         | Todas as ações geram registro com autor e diff, filtros, sem rota de edição                  | AC-6.1, AC-6.2, FR-010                      |
| `api-keys.test.ts`      | Só o hash no banco, key ausente da auditoria, revogação                                      | AC-7.3                                      |
| `authorization.test.ts` | Matriz de papel por ação; quem não é membro não vê o projeto                                 | AC-7.2                                      |
| `e2e/login.spec.ts`     | Link mágico lido no Mailpit, e-mail não cadastrado recusado                                  | AC-7.1                                      |
| `e2e/roles.spec.ts`     | Leitor sem botões de edição; action forjada recebe 403                                       | AC-7.2                                      |
| `e2e/flag.spec.ts`      | Ligar uma flag na tela faz o `/v1/config` real mudar em menos de 5 s                         | AC-1.1 (console → decisão), NFR-003 parcial |
| `e2e/api-key.spec.ts`   | Key aparece uma vez e funciona no serviço de decisão; revogada para de funcionar             | AC-7.3                                      |

**Limite conhecido:** o login pelo GitHub fica sem E2E, porque depende de um OAuth App e da conta real. O teste cobre a configuração e a recusa de e-mail não cadastrado; a AC-7.1 pelo GitHub precisa de uma verificação manual sua.

## 7. Requisitos que esta etapa não fecha

- **AC-1.1 e AC-1.2 completas:** dependem do SDK e da loja.
- **AC-2.x, AC-3.2 a 3.4, AC-4.4 e AC-5.x:** dependem da avaliação do autor e do SDK.
- **`/v1/evaluate`:** segue respondendo 500 até a sua implementação. O console usa só `/v1/config`.
