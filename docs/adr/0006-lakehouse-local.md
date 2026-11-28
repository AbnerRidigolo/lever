# ADR-006 — Lakehouse local, compatível com a AWS

| Campo  | Valor                                                 |
| ------ | ----------------------------------------------------- |
| Status | Aceito                                                |
| Data   | 27/11/2026                                            |
| Spec   | 002 (D1, Q2; plano `base-002`, decisões D1 a D3 e T5) |

## Contexto

A fase 2 grava eventos em camadas (bronze, silver e gold) e calcula a análise estatística a partir da gold. A ideação cita Firehose, Glue e Athena. A questão Q2 da spec 002 perguntou se o lakehouse roda local ou na AWS já nesta fase, e o autor decidiu por **local**, pelos mesmos motivos da spec 001: CI sem credenciais, custo zero e testes que sobem tudo com Docker.

A escolha só vale se a troca para a AWS na spec 005 não mudar contratos. Por isso cada peça local precisa falar o mesmo protocolo da peça da AWS.

O plano `base-002` previa o MinIO como armazenamento S3. Em 27/11/2026 o repositório `minio/minio` não existe mais no Docker Hub, porque o MinIO parou de publicar imagens da edição comunitária. Foi preciso trocar a peça (decisão D1 do plano, aprovada pelo autor).

## Decisão

Três serviços no `infra/docker-compose.yml`, mais um serviço avulso que prepara o bucket:

| Peça local                                                   | Peça na AWS (spec 005) | Observação                                                            |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------- |
| SeaweedFS (`chrislusf/seaweedfs:4.53`), porta 8333           | Amazon S3              | Gateway S3 com acesso por caminho (_path-style_), bucket `lever-lake` |
| Catálogo Iceberg REST (`apache/iceberg-rest-fixture:1.10.1`) | AWS Glue Data Catalog  | Warehouse em `s3://lever-lake/warehouse`, `S3FileIO`                  |
| Trino (`trinodb/trino:484`), catálogo `lake`                 | Amazon Athena          | O Athena v3 é baseado em Trino, então o SQL é o mesmo dialeto         |

- **Bucket.** O serviço `lakehouse-init` cria o bucket `lever-lake` com `weed shell` (`s3.bucket.create`), tenta de novo enquanto o mestre elege o líder e trata "já existe" como sucesso. Pode rodar quantas vezes for preciso.
- **Persistência do catálogo (D3).** A imagem do catálogo é feita para testes e guarda tudo em memória. O catálogo JDBC dela aponta para um arquivo SQLite num volume (`CATALOG_URI=jdbc:sqlite:file:/data/catalog.db`), e o `lakehouse-init` dá ao usuário do contêiner (uid 1000) acesso de escrita ao volume. As tabelas sobrevivem a um reinício do catálogo.
- **Configuração.** Os parâmetros do catálogo vêm de variáveis `CATALOG_*` (`__` vira `-` e `_` vira `.`). O Trino usa o sistema de arquivos S3 nativo e lê as credenciais com `${ENV:...}` em `infra/trino/catalog/lake.properties`. As chaves são fictícias e vêm do `.env.example` (`LAKE_*`).
- **Fumaça.** `bash infra/lakehouse/smoke.sh` sobe os quatro serviços, cria `lake.smoke`, grava uma linha, confere `count(*) = 1`, reinicia o catálogo, confere de novo e apaga o schema. O job `Lakehouse smoke` do CI roda o mesmo script.
- **dbt.** `dbt-trino` agora e `dbt-athena` na 005.

## Alternativas consideradas

- **AWS de verdade já na fase 2:** mais fiel, mas o CI precisaria de credenciais, haveria custo e os testes dependeriam de rede.
- **MinIO:** era a escolha original, mas as imagens da edição comunitária saíram do Docker Hub.
- **RustFS:** compatível com S3, mas ainda está na versão 1.0.
- **Garage:** compatível com S3, mas exige configurar o layout e as chaves por linha de comando antes do primeiro uso, o que complica o `up` do compose e do CI.
- **Lakekeeper ou Polaris no lugar do catálogo de teste:** são catálogos de produção, porém mais pesados. Só entram em discussão se o SQLite da D3 não bastar, e essa decisão é do autor.

## Consequências

- Nada muda nos contratos: SeaweedFS, Iceberg REST e Trino falam S3, a API REST do Iceberg e SQL.
- **Na spec 005**, trocam-se adaptadores e configuração: o destino do coletor passa a ser o S3 (ou o Firehose), o catálogo passa a ser o Glue (`iceberg.catalog.type=glue` no lugar de `rest`), o dbt passa de `dbt-trino` para `dbt-athena` e o Terraform cria o bucket, o catálogo e o workgroup do Athena. Diferenças de dialeto entre o Trino local e o Athena precisam de uma checagem na troca.
- As imagens são grandes (Trino e catálogo têm centenas de MB), e o primeiro `docker compose up` é lento. O job de CI tem 15 minutos de limite.
- O catálogo em SQLite serve a um processo só e não é para produção.
- As portas novas são 8333 (S3), 8181 (catálogo) e 8080 (Trino), todas configuráveis no `.env`.
