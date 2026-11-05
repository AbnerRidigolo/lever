# ADR-002 — Função de hash para atribuição

| Campo  | Valor                                     |
| ------ | ----------------------------------------- |
| Status | **Proposto — decisão reservada ao autor** |
| Data   | 05/11/2026                                |
| Spec   | 001 (FR-004, US-2, US-3, NFR-001)         |

> Este ADR traz só o contexto e os critérios. A escolha e a implementação ficam com o autor (AGENTS.md, partes reservadas), em `packages/evaluation/src/assignment.ts`.

## Contexto

A atribuição precisa ser determinística: depender só da chave do recurso, do salt e do id do usuário (FR-004). O mesmo usuário recebe o mesmo resultado em qualquer instância do serviço ou do SDK (AC-2.3). O resultado é um bucket de 0 a 9.999 pontos-base (`bucketOf`), usado no rollout das flags e na divisão entre variantes.

## Critérios, todos com teste em `pnpm --filter @lever/evaluation test:author`

- **Uniformidade:** um rollout de 10% liga a flag para 9,5% a 10,5% de 100.000 ids sintéticos (AC-2.1); um 50/50 fica entre 49,5% e 50,5% (AC-3.2).
- **Monotonicidade do rollout:** quem recebeu a flag com 10% continua recebendo com 50% (AC-2.2).
- **Independência entre experimentos:** estar na variante B de um experimento não muda a chance de estar na B de outro (AC-3.4). Isso depende de a chave e o salt entrarem no hash.
- **Mesmo resultado em qualquer runtime:** não pode depender de algo que varie entre versões do Node ou entre máquinas.
- **Custo:** compatível com avaliação local abaixo de 1 ms no p99 (NFR-001).

## Opções da spec

| Opção                 | A favor                                                              | Contra                                                                                                  |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| MurmurHash3 (32 bits) | Muito rápido; usado por várias ferramentas de feature flags          | Exige uma implementação própria ou uma dependência; cuidado com a conversão de texto para bytes (UTF-8) |
| SHA-256 truncado      | Disponível no `node:crypto`, sem dependência; distribuição muito boa | Mais lento; o `node:crypto` não existe num futuro SDK de navegador sem polyfill                         |

Nos dois casos, converter o hash para 0–9.999 com módulo introduz um viés pequeno, desprezível para 32 bits.

## Decisão

_A preencher pelo autor._

## Consequências

_A preencher pelo autor._ Trocar a função depois muda a variante de todos os usuários em experimentos em andamento, então a escolha deve ser definitiva antes de qualquer experimento real.
