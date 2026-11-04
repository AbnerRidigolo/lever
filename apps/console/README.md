# apps/console

Console do Lever (Next.js, App Router): login, papéis, projetos, flags, experimentos, segmentos, API keys e auditoria. Spec: [001](../../specs/001-plataforma-base/spec.md). Plano: [`plan-console.md`](../../specs/001-plataforma-base/plan-console.md).

## Como rodar

Com o banco migrado e o seed aplicado (veja o README da raiz):

```bash
pnpm build
pnpm --filter @lever/console dev        # http://localhost:3000
```

1. Entre com `admin@lever.local`, o admin do seed.
2. O link de acesso chega no Mailpit, em <http://localhost:8025>.
3. Só entra quem um admin cadastrou como membro de algum projeto.

O login pelo GitHub aparece quando `AUTH_GITHUB_ID` e `AUTH_GITHUB_SECRET` estão definidos. Para isso, crie um OAuth App no GitHub com a callback `http://localhost:3000/api/auth/callback/github`.

## Como funciona

- **Camada de servidor (`src/server/`):** toda operação recebe `{ db, userId }`, confere o papel no projeto e valida a entrada com Zod.
- **Mutações (`runMutation`):** cada mudança, sua auditoria e a nova versão de configuração vão na mesma transação. O trigger do banco avisa o serviço de decisão.
- **Server Actions (`src/app/actions/`):** passam por `runAction`. Sem sessão, a resposta é 401; com papel insuficiente, 403 (`forbidden()`); com um recurso de outro projeto, 404.
- **Interface:** Server Components por padrão. Componentes cliente só nos editores de regras e variantes e nos formulários.

## Testes

```bash
pnpm --filter @lever/console test       # integração com Postgres real (Testcontainers)
pnpm test:e2e                           # Playwright: precisa de Postgres e Mailpit no ar
```

O E2E cria o banco `lever_e2e`, separado do de desenvolvimento, e sobe o console na porta 3100 e o serviço de decisão na 4100.
