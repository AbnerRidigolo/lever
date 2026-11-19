# ADR-002 — Função de hash para atribuição

Status: aceito em 19/11/2026, com autorização expressa do autor para implementar o motor.

Spec: 001 (FR-004, US-2, US-3, NFR-001).

## Decisão

Usar SHA-256 de `JSON.stringify([resourceKey, salt, userId])`, codificado em UTF-8. Ler os primeiros quatro bytes como inteiro unsigned big-endian e aplicar módulo 10.000. A serialização em tupla evita ambiguidades com separadores contidos nos identificadores.

O rollout compara o bucket com o limite em pontos-base. A atribuição percorre os intervalos cumulativos dos pesos na ordem recebida na configuração. Chave, salt, ordem das variantes e algoritmo devem permanecer estáveis durante um experimento.

## Motivos e consequências

`node:crypto` já está disponível nos dois consumidores atuais (SDK de servidor e serviço de decisão), sem nova dependência. Um futuro SDK de navegador precisará reproduzir exatamente os mesmos bytes e a mesma conversão.

O módulo introduz um viés inferior a um bucket por 2^32 valores de hash. Os testes verificam uniformidade em 100.000 usuários, independência entre experimentos, estabilidade e monotonicidade. O benchmark do SDK passa a usar o avaliador real para verificar NFR-001.

Mudar esse contrato altera a atribuição; não o alterar silenciosamente em experimentos em andamento. O salt não é um segredo e o hash aqui serve para distribuição, não para autorização.
