# Manual de instalação — Linux

Guia passo a passo para rodar o ambiente completo (iEducar + Moodle + aplicação de integração)
numa máquina Linux do zero. Para um resumo rápido (quem já conhece o projeto), veja o
[README.md](../README.md) na raiz.

## 1. Pré-requisitos

- **Docker Engine** + **plugin Compose** (não precisa do Docker Desktop no Linux):
  ```bash
  docker --version
  docker compose version   # precisa ser v2.20 ou mais novo (usamos a chave `include:`)
  ```
  Se não tiver Docker instalado, siga o guia oficial: <https://docs.docker.com/engine/install/>.
  Depois de instalar, adicione seu usuário ao grupo `docker` para não precisar de `sudo` em todo
  comando (opcional, mas recomendado):
  ```bash
  sudo usermod -aG docker $USER
  newgrp docker   # ou abra um novo terminal
  ```
- **Git**.
- **~4 GB de espaço em disco livre** (imagens do iEducar, Moodle e dois Postgres).
- Portas livres no host: `80`, `443`, `8080`, `8443`, `5432`, `5433`, `6379`, `3000`.

## 2. Clonar o repositório

```bash
git clone https://github.com/RodrigoGagliardi/T1_ProjArq.git
cd T1_ProjArq
```

## 3. Configurar as variáveis de ambiente

Cada subprojeto tem seu próprio `.env`, a partir do `.env.example` correspondente:

```bash
cp i-educar/.env.example i-educar/.env
cp moodle/.env.example moodle/.env
cp integration/.env.example integration/.env
```

**Importante no Linux** (não se aplica no Windows/Docker Desktop): o container do iEducar roda
com um usuário interno cujo UID/GID é definido no build. Se não corresponder ao seu usuário do
host, os arquivos que o container cria (logs, cache) ficam com outro dono no disco e você vai
precisar de `sudo` para tocar neles depois. Ajuste antes de buildar:

```bash
echo "HOST_UID=$(id -u)" >> i-educar/.env
echo "HOST_GID=$(id -g)" >> i-educar/.env
```

## 4. Subir o ambiente

```bash
docker compose up -d --build
```

Isso builda as imagens do iEducar (demora alguns minutos na primeira vez) e levanta 9 containers:
`postgres`, `redis`, `php`, `fpm`, `horizon`, `nginx` (iEducar), `postgresql`, `moodle` (Moodle) e
`integration` (nossa aplicação).

Confira que todos subiram:

```bash
docker compose ps
```

**Normal nesta etapa**: o container `integration` vai ficar reiniciando em loop — ele só fica
estável depois do passo 7 (precisa dos dois tokens). O `horizon` também pode reiniciar; não é
usado por esta integração (ver seção de solução de problemas).

## 5. Finalizar a instalação do iEducar

Essa parte instala as dependências PHP (Composer) e prepara o banco. **Só precisa ser feita uma
vez.**

```bash
docker compose exec php composer new-install
```

Isso executa, em sequência: `composer install`, geração da chave da aplicação, link de symlinks
de storage, e `php artisan migrate`. No Linux, geralmente roda até o fim sem interrupção (ao
contrário do Windows, onde um passo de permissões falha no meio — ver a seção 8 se isso acontecer
com você também).

Depois, popule o banco:

```bash
docker compose exec php php artisan db:seed
```

E, para ter turmas e matrículas reais para testar a integração (recomendado):

```bash
docker compose exec php php artisan db:seed --class=DemoSeeder
```

Confirme que o iEducar está respondendo:

```bash
curl -I http://localhost
```

Acesse `http://localhost` no navegador — login `admin` / senha `123456789`.

## 6. Gerar o token de acesso do iEducar

A aplicação de integração lê dados do iEducar através da API REST dele, autenticada por um token
(não existe endpoint de login — o token é gerado por linha de comando):

```bash
docker compose exec fpm php artisan admin:token "moodle-sync"
```

Copie o token impresso (algo como `1|abcdef...`) e cole em `integration/.env`:

```env
IEDUCAR_API_TOKEN=1|abcdef...
```

## 7. Habilitar os Web Services do Moodle e gerar o token

O Moodle já está instalado e no ar em `http://localhost:8080` (login `admin` /
`moodle_admin_pw`). Esta parte é manual, feita pela interface:

1. **Administração do site → Recursos → Avançados** → marque *Habilitar web services*.
2. **Administração do site → Servidor → Web services → Visão geral** → siga o assistente,
   escolhendo o protocolo **REST**.
3. **Gerenciar serviços → Adicionar serviço externo** (ex. "iEducar Bridge") → marque *Somente
   usuários autorizados* → adicione as funções:
   - `core_course_create_courses`
   - `core_course_update_courses`
   - `core_course_get_courses_by_field`
   - `core_user_create_users`
   - `core_user_get_users`
   - `enrol_manual_enrol_users`
   - `core_enrol_get_enrolled_users`
4. **Gerenciar tokens → Adicionar** → usuário `admin`, serviço "iEducar Bridge" → copie o token.

Cole o token em `integration/.env`:

```env
MOODLE_WS_TOKEN=<token gerado>
```

## 8. Iniciar a aplicação de integração

```bash
docker compose up -d integration
docker compose logs -f integration
```

Os logs devem mostrar o servidor HTTP no ar e o primeiro ciclo de sincronização rodando, sem a
mensagem de "Configuração inválida".

## 9. Testar de ponta a ponta

```bash
curl -X POST http://localhost:3000/sync/run
curl http://localhost:3000/sync/status
```

Depois, confira em `http://localhost:8080` → **Gerenciar cursos e categorias** que os cursos
correspondentes às turmas do iEducar foram criados.

## 10. Testes automatizados (opcional)

```bash
cd integration
npm install
npm test
```

## 11. Solução de problemas

- **`composer install`/`composer new-install` falha com "os requerimentos não puderam ser
  resolvidos para um set de pacotes instaláveis"**: é um conflito de dependências/extensões do
  PHP, não um problema de permissão. Rode `docker compose exec php composer install` sozinho e
  leia o detalhamento *abaixo* da linha de resumo (o Composer normalmente aponta exatamente qual
  pacote/extensão está bloqueando). Verifique:
  - se a imagem buildou com todas as extensões PHP que o `composer.json` exige (`ext-pgsql`,
    `ext-redis`, `ext-gd`, `ext-bcmath`, etc.) — rode
    `docker compose exec php php -m` e compare com `composer.json`;
  - se não é cache de build antigo: tente `docker compose build --no-cache php fpm horizon`;
  - se a versão do PHP dentro do container corresponde à exigida (`docker compose exec php php -v`).
- **`chmod: Operation not permitted` no passo `set-permissions`**: isso é esperado só no **Windows**
  (bind mount do Docker Desktop). No Linux não deveria acontecer; se acontecer, rode manualmente:
  ```bash
  docker compose exec php php artisan key:generate --ansi
  docker compose exec php php artisan storage:link --ansi
  docker compose exec php php artisan migrate --force --ansi
  ```
- **Erro de permissão negada ao editar/remover arquivos criados pelo container** (ex.
  `storage/logs`): o `HOST_UID`/`HOST_GID` do passo 3 não bate com o seu usuário. Ajuste o `.env`
  e rode `docker compose up -d --build php fpm horizon` de novo.
- **`ieducar-horizon` reiniciando em loop**: problema pré-existente da imagem do iEducar, não
  usado por esta integração. Pode ignorar ou `docker compose stop horizon`.
- **Login do Moodle dá "File not found"**: o `wwwroot` do Moodle foi gravado sem a porta (bug do
  `MOODLE_HOST` sem `:8080`). Já corrigido no `.env.example` deste repositório; se acontecer numa
  reinstalação com `.env` antigo, edite dentro do container o arquivo
  `/bitnami/moodle/config.php`, trocando `'http://' . 'localhost'` por
  `'http://' . 'localhost:8080'`, e reinicie: `docker compose restart moodle`.
- **`GET /api/school-class` ou `/api/registration` vindo vazio**: o seed padrão só cria dados de
  referência. Rode o `DemoSeeder` (passo 5).
- **`integration` continua reiniciando mesmo com os dois tokens configurados**: confira os logs
  (`docker compose logs integration`) — o erro de validação de configuração lista exatamente qual
  variável está faltando ou inválida.

## 12. Parar o ambiente

```bash
docker compose down        # mantém os dados (volumes)
docker compose down -v     # remove tudo, inclusive os bancos de dados
```
