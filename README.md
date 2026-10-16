# Integração iEducar × Moodle

Entrega 2 da disciplina: implementação de uma aplicação de integração (monólito próprio, em
Node.js/TypeScript) entre o **iEducar** (gestão escolar) e o **Moodle** (AVA), orquestrada por um
único Docker Compose.

> Manual passo a passo e detalhado para instalar em Linux: [docs/MANUAL_LINUX.md](docs/MANUAL_LINUX.md).

```
T1_projarq/
├── docker-compose.yml   # ponto de entrada único (usa `include:` para juntar os 3 projetos)
├── i-educar/            # monólito existente (clone oficial, inalterado)
├── moodle/              # Moodle + Postgres (bitnamilegacy)
├── integration/         # aplicação de integração (novo código deste trabalho)
├── report/              # relatório em LaTeX (abnTeX2)
└── latex-template/      # template original fornecido, sem alterações
```

Arquitetura e decisões técnicas estão detalhadas em `report/main.pdf`. Resumo: a aplicação de
integração faz **polling periódico** na API REST já existente do iEducar (não alteramos o código
do monólito), traduz turma→curso e enturmação→inscrição, e chama os **Web Services REST** do
Moodle. Idempotência garantida por uma tabela própria (SQLite) de mapeamento de IDs.

## Pré-requisitos

- Docker e Docker Compose v2.20+ (usa a chave `include:`)
- ~4 GB livres (imagens do iEducar + Moodle + Postgres ×2)

## Subindo o ambiente

1. Configure cada subprojeto (mantém os `.env` de cada um, como já documentado nos READMEs deles):

   ```bash
   cp i-educar/.env.example i-educar/.env        # se ainda não tiver
   cp moodle/.env.example moodle/.env            # se ainda não tiver
   cp integration/.env.example integration/.env
   ```

2. Suba tudo a partir da raiz:

   ```bash
   docker compose up -d --build
   ```

   Isso levanta: `postgres`/`redis`/`fpm`/`nginx`/`horizon` (iEducar), `postgresql`/`moodle`
   (Moodle) e `integration` (a aplicação deste trabalho). **A `integration` vai falhar/reiniciar
   até você configurar os dois tokens abaixo** — isso é esperado na primeira subida.

3. Finalize a instalação do iEducar (primeira vez apenas, ver `i-educar/INSTALL.md`):

   ```bash
   docker compose exec php composer new-install
   docker compose exec php php artisan db:seed
   ```

   Opcional, mas recomendado para ter dados reais pra testar a integração (turmas e matrículas
   de demonstração):

   ```bash
   docker compose exec php php artisan db:seed --class=DemoSeeder
   ```

4. Gere o token de serviço do iEducar (usado pela integração para ler turmas/matrículas):

   ```bash
   docker compose exec fpm php artisan admin:token "moodle-sync"
   ```

   Copie o token impresso para `integration/.env` → `IEDUCAR_API_TOKEN`.

5. Habilite os Web Services do Moodle e gere o token (uma vez, pela UI em
   `http://localhost:8080`, logado como `admin`):

   1. **Administração do site → Recursos → Avançados**: marque *Habilitar web services*.
   2. **Administração do site → Servidor → Web services → Visão geral** → siga o assistente,
      escolhendo o protocolo **REST**.
   3. **Gerenciar serviços** → *Adicionar serviço externo* (ex. "iEducar Bridge") → habilite
      *Somente usuários autorizados* → adicione as funções:
      `core_course_create_courses`, `core_course_update_courses`,
      `core_course_get_courses_by_field`, `core_user_create_users`, `core_user_get_users`,
      `enrol_manual_enrol_users`, `core_enrol_get_enrolled_users`.
   4. **Gerenciar tokens → Adicionar** → usuário `admin`, serviço "iEducar Bridge" → copie o
      token gerado.

   Copie o token para `integration/.env` → `MOODLE_WS_TOKEN`.

6. Reinicie só a integração:

   ```bash
   docker compose up -d integration
   ```

## Testando a integração (demo)

1. Crie uma turma nova na intranet do iEducar (`http://localhost`).
2. Dispare a sincronização manualmente (ou espere o ciclo automático, `POLL_INTERVAL_SECONDS`):

   ```bash
   curl -X POST http://localhost:3000/sync/run
   curl http://localhost:3000/sync/status
   ```

3. Confira o curso criado no Moodle (`http://localhost:8080` → *Gerenciar cursos e categorias*).

## Testes automatizados

```bash
cd integration
npm install
npm test
```

## URLs e credenciais (ambiente de desenvolvimento)

| Sistema | URL | Login |
|---|---|---|
| iEducar | http://localhost | admin / 123456789 |
| Moodle | http://localhost:8080 | admin / moodle_admin_pw |
| Integração (API/status) | http://localhost:3000 | — |

## Solução de problemas

- **`composer new-install` para no passo `set-permissions` com erro de `chmod`**: acontece em
  bind mounts do Windows (Docker Desktop), que não suportam `chmod`. A instalação já fez a parte
  importante até ali; rode manualmente o que faltou:
  ```bash
  docker compose exec php php artisan key:generate --ansi
  docker compose exec php php artisan storage:link --ansi
  docker compose exec php php artisan migrate --force --ansi
  ```
- **`ieducar-horizon` reiniciando em loop** (`env: can't execute 'php'`): problema pré-existente
  da imagem do iEducar, não usado por esta integração (que só fala com a API HTTP). Pode ignorar
  ou rodar `docker compose stop horizon`.
- **Login do Moodle dá "File not found"**: o `wwwroot` do Moodle foi gerado sem a porta (bug do
  `MOODLE_HOST` sem `:8080` no `.env` usado na primeira instalação). Já corrigido no
  `.env.example` deste repositório; se acontecer de novo (por exemplo, reinstalando o Moodle do
  zero com um `.env` antigo), edite `/bitnami/moodle/config.php` dentro do container trocando
  `'http://' . 'localhost'` por `'http://' . 'localhost:8080'` e reinicie o serviço `moodle`.
- **`GET /api/school-class`/`registration` vindo vazio**: o seed padrão só cria dados de
  referência, não turmas/matrículas. Rode o `DemoSeeder` (passo 3 acima).
- **`?active=1` trava (timeout) em `GET /api/registration`**: bug de performance pré-existente
  nesta versão do iEducar, fora do escopo desta integração. Por isso `integration/src/adapters/ieducarClient.ts`
  filtra matrícula só por `year_eq` e verifica o campo `ativo` no lado do cliente.

## Relatório

Fonte em `report/main.tex` (abnTeX2). Para compilar:

```bash
cd report
latexmk -pdf main.tex
```
