# ADR-001 — Avaliação local no SDK, com avaliação remota como alternativa

| Campo  | Valor                                                 |
| ------ | ----------------------------------------------------- |
| Status | Aceito                                                |
| Data   | 05/11/2026                                            |
| Spec   | 001 (US-5, FR-005 a FR-007, NFR-001, NFR-002, AC-5.8) |

## Contexto

Cada página da loja pode consultar várias flags e experimentos. Se cada consulta fosse uma chamada de rede ao serviço de decisão, a latência e a disponibilidade do app passariam a depender desse serviço a cada requisição. A spec pede avaliação local abaixo de 1 ms (NFR-001) e que o SDK siga funcionando se o serviço cair (AC-5.5 e AC-5.6). Também pede que o SDK e o serviço deem exatamente o mesmo resultado para a mesma configuração e o mesmo usuário (AC-5.8).

## Decisão

- **O SDK avalia localmente.** Ele recebe a configuração completa do ambiente pelo stream (`GET /v1/stream`), guarda a última versão válida em memória e avalia sem nenhuma chamada de rede por avaliação.
- **O serviço oferece `POST /v1/evaluate`** para clientes que não podem avaliar localmente, com o mesmo código de avaliação.
- **Um único código de avaliação, em `packages/evaluation`**, importado pelo serviço e pelo SDK. É assim que a paridade da AC-5.8 é garantida por construção, e não por duas implementações mantidas em sincronia. O código é reservado ao autor (AGENTS.md).
- **Nesta fase o SDK é só para servidor** (spec 001, seção 13). A loja avalia nos Server Components e envia o HTML já com a variante certa (AC-8.5).

## Alternativas consideradas

- **Só avaliação remota:** mais simples no cliente, mas põe uma chamada de rede em cada avaliação e torna o app dependente da disponibilidade do serviço.
- **Duas implementações (serviço e SDK):** permitiria otimizar cada lado, mas a paridade dependeria de disciplina e de testes de paridade cobrindo todos os casos.

## Consequências

- A configuração inteira do ambiente chega ao processo do app. Ela não tem segredos; tem salts, regras e pesos. Isso é aceitável para um SDK de servidor, mas um SDK de navegador exigiria outra decisão.
- O SDK precisa lidar com conexão, reconexão, cache e validação das mensagens. Esse trabalho foi feito no `packages/sdk`.
- O custo medido do SDK, sem a avaliação real, é de ~0,008 ms por avaliação. O número final depende da implementação do autor.
- Publicar o SDK no npm exige empacotar `@lever/evaluation` e `@lever/schemas` dentro dele (plano do SDK, D1). Por enquanto o SDK não é publicado.
