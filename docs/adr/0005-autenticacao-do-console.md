# ADR-005 — Autenticação do console com Auth.js

| Campo  | Valor                       |
| ------ | --------------------------- |
| Status | Aceito                      |
| Data   | 05/11/2026                  |
| Spec   | 001 (US-7, AC-7.1 a AC-7.3) |

## Contexto

O console precisa de login por e-mail (link mágico) e por GitHub (AC-7.1), de papéis por projeto (`admin`, `editor` e `viewer`) e de uma API que recuse com 403 qualquer ação fora do papel, mesmo forjada (AC-7.2).

## Decisão

- **Auth.js v5** (`next-auth`), fixado na versão `5.0.0-beta.32`, com o adapter do Drizzle. A v4 estável fixa um `@auth/core` mais antigo, diferente do adapter, e foi feita para o Pages Router.
- **Provedores:** link mágico por SMTP (Mailpit localmente) e GitHub opcional, ativado só quando `AUTH_GITHUB_ID` e `AUTH_GITHUB_SECRET` estão definidos.
- **Sessões no banco** (tabelas `accounts`, `sessions` e `verification_tokens`, migration `0003`), para que remover um membro valha na hora.
- **Só entra quem foi cadastrado.** O admin adiciona o membro pelo e-mail, e o login recusa qualquer outro. O mesmo e-mail no GitHub e no link mágico leva à mesma conta.
- **Autorização no servidor.** Toda operação confere o papel no projeto. Quem não é membro recebe "não encontrado"; quem não tem o papel recebe 403 de verdade nas Server Actions, por meio de `forbidden()` com a opção experimental `authInterrupts` do Next. Um teste E2E forja a chamada com a sessão de um leitor e confirma o 403.

## Alternativas consideradas

- **next-auth v4:** estável, mas incompatível com o adapter atual e menos adequado ao App Router.
- **Rotas HTTP próprias para as mutações:** dariam o 403 sem recurso experimental, mas duplicariam as Server Actions que o AGENTS.md pede.
- **Sessão em JWT:** dispensaria a tabela de sessões, mas remover um membro só valeria quando o token expirasse.

## Consequências

- Depender de uma versão beta e de uma opção experimental do Next. As duas estão fixadas e cobertas por testes, mas atualizar exige rodar o E2E de papéis.
- No Auth.js v5, `signIn()` lança `AccessDenied` em vez de redirecionar quando o login é recusado; a tela de login trata isso.
- O login pelo GitHub não tem E2E, porque depende de um OAuth App real.
