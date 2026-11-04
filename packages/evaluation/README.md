# packages/evaluation

Avaliação de flags e experimentos (`@lever/evaluation`): hash e bucketing (`src/assignment.ts`) e regras de segmento e rollout (`src/evaluation.ts`). O serviço de decisão e o SDK usam este mesmo código, então os dois dão sempre o mesmo resultado para a mesma configuração e o mesmo usuário (AC-5.8).

**Reservado ao autor** (AGENTS.md). Por enquanto só existem as assinaturas, que lançam `not implemented`.

## Testes

```bash
pnpm --filter @lever/evaluation test:author
```

São 43 testes escritos a partir da spec: FR-004, AC-2.1 a 2.3, AC-3.2 a 3.5 e AC-4.1 a 4.4. Ficam fora do `pnpm test` até a implementação existir. Quando todos passarem, mova `test/author/` para a suíte principal (`vitest.config.ts`).

A interpretação do operador `contains` nos testes é: substring de um atributo texto, ou elemento de um atributo lista. Confirme ou ajuste.
