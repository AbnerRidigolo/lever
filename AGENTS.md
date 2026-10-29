# [AGENTS.md](http://AGENTS.md) — Lever

Instruções para qualquer agente de código trabalhando neste repositório (Claude Code, Codex, OpenCode ou outro), inclusive em worktrees paralelas no Orca.

## O projeto

O Lever é uma plataforma de experimentação com um sistema de recomendação acoplado. Ele oferece feature flags, testes A/B com análise estatística, um sistema de recomendação (embeddings + ranqueamento) e agentes de IA que interpretam resultados. Uma loja de demonstração usa o Lever para provar que tudo funciona.

A visão completa está em `docs/[ideacao.md](http://ideacao.md)`. As specs de cada fase ficam em `specs/`.

## Como trabalhamos: Spec-Driven Development

1. **Nenhum código sem spec.** Antes de começar, leia a spec da tarefa em `specs/<NNN>-<nome>/[spec.md](http://spec.md)` por inteiro.
2. **A spec manda.** Se o pedido contradiz a spec, siga a spec e avise.
3. **Ambiguidade = pare e pergunte.** Se um requisito estiver ambíguo ou faltando, não invente: escreva a dúvida no fim do seu resumo e implemente só o que está claro.
4. **Critérios de aceite são o teste.** Cada critério de aceite da spec deve ter pelo menos um teste automatizado correspondente. Cite o ID do critério no nome ou descrição do teste (ex.: `it('AC-1.2: ...')`).
5. **Ao terminar**, liste quais requisitos (FR-xxx) e critérios (AC-x.x) foram cobertos e quais ficaram de fora.

## Estrutura do monorepo

```
apps/
  console/          Next.js (App Router) — console do Lever
  store/            Next.js (App Router) — loja de demonstração
services/
  decision/         Node + Fastify — configuração, avaliação e stream de flags/experimentos
  collector/        (fase 2) coleta de eventos
  recommendation/   (fase 3) busca vetorial + ranqueamento
  agents/           (fase 4) LangGraph.js
packages/
  schemas/          Zod — contratos compartilhados (fonte da verdade dos tipos)
  db/               Drizzle — schema, migrations e seeds do Postgres
  sdk/              SDK TypeScript publicado no npm (@lever/sdk)
  config/           tsconfig, eslint e prettier compartilhados
ml/                 (fase 3) Python — treino dos modelos
infra/              Terraform, docker-compose, Grafana
specs/              Specs do SDD, uma pasta por feature
docs/adr/           Architecture Decision Records

```

## Comandos

```bash
pnpm install                 # dependências
docker compose up -d         # Postgres, Prometheus, Grafana locais
pnpm db:migrate              # aplica migrations
pnpm db:seed                 # dados de exemplo
pnpm dev                     # sobe todos os apps e serviços
pnpm --filter <pacote> dev   # sobe só um pacote
pnpm test                    # Vitest em todo o monorepo
pnpm test:e2e                # Playwright
pnpm lint && pnpm typecheck  # obrigatório antes de abrir PR

```

## Regras de código

- **TypeScript estrito** (`strict: true`). Proibido `any`; use `unknown` e valide.
- **Zod em toda fronteira**: corpo de request, resposta de API, variáveis de ambiente, mensagens de stream. Os tipos vêm de `packages/schemas` via `z.infer`. Nunca duplique um tipo que já existe lá.
- **Banco só via Drizzle** em `packages/db`. SQL cru apenas em migrations ou quando a spec pedir, sempre parametrizado.
- **Erros**: nunca engula exceções. Serviços retornam erros no formato definido em `packages/schemas/errors.ts`.
- **Logs** estruturados com `pino`, sem dados pessoais.
- **Observabilidade**: todo serviço novo expõe `/metrics` (Prometheus) e é instrumentado com OpenTelemetry.
- **Next.js**: Server Components por padrão; `"use client"` só quando houver interatividade. Mutações via Server Actions com validação Zod.
- **Exports nomeados**, sem `export default` (exceto onde o Next.js exige).
- Código, nomes e commits em **inglês**. Specs, ADRs e documentação em **português**.

## Regras para worktrees paralelas (Orca)

- **Cada worktree tem um escopo**, definido na tarefa. Não altere arquivos fora dele.
- `packages/schemas` **e** `packages/db` **são compartilhados.** Só a worktree com essa tarefa explícita pode alterá-los. Se você precisar de uma mudança neles, pare e descreva a mudança no resumo.
- **Migrations: uma worktree por vez.** Nunca crie migration em paralelo com outra worktree.
- Um PR por worktree, pequeno e focado. Rebase em `main` antes de abrir.

## Partes reservadas ao autor humano

Estas partes são escritas à mão pelo autor do projeto. **Não implemente**, mesmo que pareça óbvio. Você pode criar a assinatura da função com `throw new Error('not implemented: reserved for author')`, os testes a partir da spec e o código ao redor.

- Algoritmo de atribuição de variantes (hash e bucketing) — `services/decision/src/assignment/`
- Avaliação de regras de segmentação e rollout — `services/decision/src/evaluation/`
- Toda a estatística de experimentos (fase 2)
- Ranqueamento e lógica do modelo de recomendação (fase 3)

## Testes

- **Unitários e integração**: Vitest. Integração com Postgres real via Testcontainers, nunca mock do banco.
- **E2E**: Playwright, nos fluxos descritos nas specs.
- **Carga**: k6 em `infra/k6/`, quando a spec definir metas de latência.
- Todo PR precisa passar em `lint`, `typecheck` e `test`.

## Commits e PRs

- Conventional Commits: `feat(decision): add SSE stream for config updates`.
- Descrição do PR: spec relacionada, FR/AC cobertos, o que ficou de fora e como testar.

## Segurança

- Nunca commite segredos. Use `.env.example` com valores fictícios.
- API keys do SDK são guardadas só como hash no banco.
- Somente dados sintéticos. Nada de dados reais de nenhuma empresa.