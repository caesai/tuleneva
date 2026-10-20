# Запуск Tuleneva на новом VPS

Инструкция для Ubuntu LTS. Клиент — статика Nginx, API и бот — Node через systemd, данные — MongoDB только на `127.0.0.1`.

Сборка идёт в GitHub Actions. На сервер приезжает готовый релиз (`dist/` + `server/dist/index.cjs`); на VPS выполняется `npm ci --omit=dev` и переключается symlink `current`. Секреты и MongoDB пайплайн не трогает.

Шаблоны в репозитории: [deploy/tuleneva-api.service](../deploy/tuleneva-api.service), [deploy/nginx-tuleneva.conf](../deploy/nginx-tuleneva.conf), [deploy/remote-release.sh](../deploy/remote-release.sh).

## 1. Пакеты

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx gnupg curl

# Репозиторий MongoDB (официальный; пакет mongodb-org иначе не найдётся)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Node 20 — системно (apt), не через nvm.
# CD запускает `npm ci` от пользователя deploy по неинтерактивному SSH;
# nvm в ~/.nvm у вашего логина deploy не видит → будет "npm: command not found".
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v
```

Подставьте кодовое имя Ubuntu (`jammy`, `noble` и т.д.) в URL репозитория MongoDB.

После создания пользователя `deploy` (§2) проверьте, что Node виден именно ему:

```bash
sudo -u deploy bash -lc 'which npm && npm -v'
# или с вашей машины:
# ssh -i tuleneva-deploy deploy@IP 'which npm && npm -v'
```

Если `npm` не находится — Node не установлен системно; повторите блок `nodesource` / `apt install nodejs` выше.

### MongoDB: localhost, auth и пароль для приложения

Пароль в `MONGO_URI` (§3) — это **не** SSH и не JWT. Его ты задаёшь здесь, один раз, и потом копируешь в `/etc/tuleneva/api.env`.

```bash
sudo systemctl enable --now mongod
```

Убедитесь, что Mongo слушает только localhost (`bindIp: 127.0.0.1` в `/etc/mongod.conf`, секция `net`).

**Пока authorization выключена**, создайте admin и пользователя приложения (придумайте два надёжных пароля и сохраните их):

```bash
mongosh
```

```javascript
use admin
db.createUser({
  user: "mongoAdmin",
  pwd: "ПАРОЛЬ_ADMIN",   // только для mongosh / админки
  roles: [ { role: "root", db: "admin" } ]
})

db.createUser({
  user: "tuleneva",
  pwd: "ПАРОЛЬ_ПРИЛОЖЕНИЯ",  // именно его потом в MONGO_URI
  roles: [ { role: "readWrite", db: "test" } ]
})
```

Включите авторизацию в `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
```

Проверка (должна пройти с паролем приложения):

```bash
mongosh 'mongodb://tuleneva:ПАРОЛЬ_ПРИЛОЖЕНИЯ@127.0.0.1:27017/test?authSource=admin' --eval 'db.runCommand({ ping: 1 })'
```

Дальше в §3 в `MONGO_URI` подставьте тот же `ПАРОЛЬ_ПРИЛОЖЕНИЯ`.

UFW (рекомендуется): открыть 22, 80, 443; MongoDB наружу не открывать.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 2. Пользователь deploy и каталоги релизов

Клон репозитория на VPS для рантайма **не нужен**. Деплой кладёт артефакты в `releases/<git-sha>/`.

```bash
sudo groupadd --system tuleneva || true
sudo useradd --system --create-home --shell /bin/bash --groups tuleneva deploy || true
sudo usermod -aG tuleneva www-data

sudo mkdir -p /var/www/tuleneva/releases
sudo chown -R deploy:tuleneva /var/www/tuleneva
sudo chmod 2775 /var/www/tuleneva /var/www/tuleneva/releases

# SSH только по ключу для deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
# Вставьте публичный ключ CI:
# sudo tee /home/deploy/.ssh/authorized_keys <<'EOF'
# ssh-ed25519 AAAA... tuleneva-github-actions
# EOF
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
```

В `/etc/ssh/sshd_config` для пользователя `deploy` отключите пароль (`PasswordAuthentication no` глобально или через `Match User`).

Sudoers только для рестарта API:

```bash
echo 'deploy ALL=(root) NOPASSWD: /bin/systemctl restart tuleneva-api, /bin/systemctl is-active tuleneva-api' \
  | sudo tee /etc/sudoers.d/tuleneva-deploy
sudo chmod 440 /etc/sudoers.d/tuleneva-deploy
```

Пути сервиса: `systemctl` обычно в `/bin/systemctl` или `/usr/bin/systemctl` — проверьте `which systemctl` и подставьте точный путь в sudoers.

## 3. Переменные окружения сервера

Секреты **не** лежат в дереве релиза. Файл `/etc/tuleneva/api.env`:

```bash
sudo mkdir -p /etc/tuleneva
sudo tee /etc/tuleneva/api.env <<'EOF'
TELEGRAM_TOKEN=токен_от_BotFather
JWT_SECRET=длинная_случайная_строка
WEB_APP_BASE_URL=https://tuleneva25.ru
# ПАРОЛЬ_ПРИЛОЖЕНИЯ — тот, что задали в §1 при db.createUser для user "tuleneva"
MONGO_URI=mongodb://tuleneva:ПАРОЛЬ_ПРИЛОЖЕНИЯ@127.0.0.1:27017/test?authSource=admin
PORT=3000
# Если api.telegram.org с этой машины недоступен — прокси или local Bot API:
# TELEGRAM_API_ROOT=https://ваш-прокси
# TELEGRAM_NOTIFY_TIMEOUT_MS=8000
# SMTP для писем подтверждения почты
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=noreply@tuleneva25.ru
EOF

sudo chown root:www-data /etc/tuleneva/api.env
sudo chmod 640 /etc/tuleneva/api.env
```

`JWT_SECRET` новый на каждом чистом деплое: старые токены перестанут действовать.

## 4. Первый релиз (bootstrap)

Пока нет `current`, systemd и Nginx не стартуют. Первый релиз можно выложить вручную или дождаться успешного job `deploy` в Actions после настройки секретов (см. раздел 12).

Минимальный ручной bootstrap (с машины, где есть собранные артефакты):

```bash
# На VPS от deploy, пример:
SHA=manual-bootstrap
mkdir -p /var/www/tuleneva/releases/$SHA
# скопировать dist/ и server/{dist,package.json,package-lock.json} в releases/$SHA/
cd /var/www/tuleneva/releases/$SHA/server && npm ci --omit=dev
ln -sfn /var/www/tuleneva/releases/$SHA /var/www/tuleneva/current
```

Либо положите скрипт [deploy/remote-release.sh](../deploy/remote-release.sh) и вызовите его с архивом `dist/` + `server/`.

## 5. Первый super_admin

До того как остальные откроют мини-приложение, создайте администратора в `mongosh` (база `test`):

```javascript
db.users.insertOne({
  telegram_id: ВАШ_ЧИСЛОВОЙ_ID,
  first_name: "Имя",
  username: "username",
  role: "super_admin",
  identities: [{
    provider: "telegram",
    providerUserId: "ВАШ_ЧИСЛОВОЙ_ID",
    verifiedAt: new Date()
  }],
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Числовой id показывает @userinfobot. После вставки откройте мини-приложение своим Telegram — логин найдёт запись.

## 6. systemd

Скопируйте шаблон [deploy/tuleneva-api.service](../deploy/tuleneva-api.service) в `/etc/systemd/system/tuleneva-api.service` (после появления symlink `current`):

```bash
sudo cp /path/to/tuleneva-api.service /etc/systemd/system/tuleneva-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now tuleneva-api
sudo systemctl status tuleneva-api
```

Юнит читает `/etc/tuleneva/api.env` и запускает `/var/www/tuleneva/current/server/dist/index.cjs`.

## 7. Nginx

Шаблон: [deploy/nginx-tuleneva.conf](../deploy/nginx-tuleneva.conf). Корень статики — `/var/www/tuleneva/current/dist`. Проксируйте `/api` и `/ws` на `127.0.0.1:3000`.

```bash
sudo cp /path/to/nginx-tuleneva.conf /etc/nginx/sites-available/tuleneva
sudo ln -sfn /etc/nginx/sites-available/tuleneva /etc/nginx/sites-enabled/tuleneva
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tuleneva25.ru
```

После смены `root` на `current/dist` Nginx reload один раз; дальше CD только переключает symlink и не перезагружает Nginx.

В BotFather укажите Web App URL на `https://tuleneva25.ru/app` (или ваш актуальный путь мини-приложения).

## 8. Бэкапы MongoDB

Скрипт: [server/scripts/backup-mongo.sh](../server/scripts/backup-mongo.sh).

Скрипт не обязан жить в каталоге релиза — скопируйте его отдельно (например в `/usr/local/bin/` или `/etc/tuleneva/`) либо укажите путь к копии в `current` после первого деплоя.

```bash
sudo mkdir -p /var/backups/tuleneva /etc/tuleneva
# Скопируйте backup-mongo.sh и сделайте исполняемым

# /etc/tuleneva/backup.env:
#   MONGO_URI=mongodb://...
#   BACKUP_DIR=/mnt/backups/tuleneva
#
# cron (ежедневно в 03:15 UTC), каталог бэкапа — другой диск при возможности:
# 15 3 * * * set -a; . /etc/tuleneva/backup.env; set +a; /usr/local/bin/backup-mongo.sh >> /var/log/tuleneva-backup.log 2>&1
```

## 9. Восстановление пользователей после потери диска

1. Попросите у хостера снимок диска или `/var/lib/mongodb` / готовый `mongodump`.
2. Если дамп есть **до** того, как люди заново зарегистрировались: `mongorestore` коллекций `users` и `rehearsals` со старыми `_id` — слоты снова привязаны к людям.
3. Если люди уже созданы заново, а дамп пришёл позже: не вставляйте старых users поверх (конфликт `telegram_id`). Сопоставьте по `telegram_id` и перепишите `rehearsals.hours[].userId` со старого `_id` на новый.
4. Почты в старой базе не было — после восстановления каждый привязывает почту в мини-приложении («Вход в браузере») или админ задаёт почту и временный пароль в `/admin`.

Бывшие участники без дампа: одна ссылка в общий чат, затем закрыть её.

1. Войдите своим `super_admin` и откройте админку.
2. «Пригласить пользователя» → включите «Ссылка для общего чата» (роль станет «Пользователь») → сгенерируйте.
3. Отправьте в чат Telegram-ссылку. Каждый, кто откроет её в мини-приложении, сразу получит роль `user`.
4. Когда все нужные люди прошли — «Закрыть ссылку». Новые регистрации по ней прекращаются. Сама ссылка погаснет через 7 дней, даже если забыть закрыть.
5. Почту каждый привязывает сам после входа или вы задаёте её в админке.

## 10. Проверка

- `curl -s https://tuleneva25.ru/api/` — ответ API (через Nginx) или `curl -s http://127.0.0.1:3000/` на самом VPS.
- `readlink /var/www/tuleneva/current` — указывает на `releases/<sha>`.
- Мини-приложение: вход Telegram, запрос доступа, бронь.
- Браузер: `/app` → «Войти по почте» → модалка с тем же аккаунтом (после подтверждения ссылки из письма).
- SMTP задан: привязка почты в мини-приложении или админке шлёт письмо со ссылкой `/app?emailConfirm=...`.
- Если уведомления бота молчат — задайте `TELEGRAM_API_ROOT` на хост, который видит Telegram Bot API.
- `systemctl status tuleneva-api` — один процесс; второй инстанс не поднят.

## 11. Обновление (CD)

На push в `main` / `master` после зелёных тестов GitHub Actions:

1. Собирает клиент (`dist/`) и серверный бандл (`server/dist/index.cjs`).
2. Пакует архив и по SSH (`deploy`) загружает на VPS.
3. Запускает [deploy/remote-release.sh](../deploy/remote-release.sh): `npm ci --omit=dev`, переключение `current`, `systemctl restart tuleneva-api`, healthcheck, при сбое — откат на предыдущий релиз, prune (оставляет 3 последних).

Ручной `git pull` + `npm run build` на сервере **не** используется.

## 12. Секреты GitHub Actions

В настройках репозитория → Secrets and variables → Actions добавьте:

| Secret | Значение |
|--------|----------|
| `VPS_HOST` | IP или hostname VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Приватный ключ (ed25519), пара к `authorized_keys` |
| `VPS_KNOWN_HOSTS` | Вывод `ssh-keyscan -H <host>` |

Workflow: [.github/workflows/test.yml](../.github/workflows/test.yml), job `deploy` только на `push` в `main`/`master` (не на pull request). Concurrency `production-deploy` не отменяет уже идущий деплой.
