# packages/evaluation

Motor compartilhado pelo SDK e pelo serviço de decisão. Implementa flags, rollout percentual, segmentação e atribuição determinística de variantes.

- SHA-256 da tupla JSON UTF-8 `[resourceKey, salt, userId]`; primeiros 32 bits big-endian, módulo 10.000.
- Rollout: o usuário participa quando seu bucket é menor que `rolloutBps`.
- Variantes: intervalos cumulativos na ordem da configuração; pesos zero não recebem usuários.
- Segmentos: condições combinadas por E, sem coerção de tipos. Atributos ausentes ou herdados não correspondem. Comparações negativas exigem tipos compatíveis.
- `contains`: substring em texto ou elemento exato de uma lista de textos.
- Flags desativadas ou fora do público retornam o padrão configurado. Experimentos fora de `running` ou do público retornam o controle.

## Validação

`pnpm --filter @lever/evaluation test` inclui os testes de distribuição com 100.000 usuários. `test:author` continua disponível como atalho para a suíte original. O SDK usa o mesmo motor em sua suíte padrão; os E2E reais da loja não são mais opcionais.

A implementação antes reservada ao autor foi autorizada expressamente em 19/11/2026. Consulte o ADR-002 para o contrato de estabilidade.
