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
echo 'deploy ALL=(root) NOPASSWD: /bin/systemctl restart tuleneva-api' \
  | sudo tee /etc/sudoers.d/tuleneva-deploy
sudo chmod 440 /etc/sudoers.d/tuleneva-deploy
```

Пути сервиса: `systemctl` обычно в `/bin/systemctl` или `/usr/bin/systemctl` — проверьте `which systemctl` и подставьте точный путь в sudoers. `is-active` в скрипте деплоя идёт без sudo.

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
# Один локальный Nginx. Пусто — loopback (X-Forwarded-For только с 127.0.0.1/::1).
# Число — сколько хопов доверять. false — не доверять заголовку.
# TRUST_PROXY=loopback
# Календарь только для уже существующих пользователей. По умолчанию включено — строку можно не добавлять.
# Выключить: STEALTH_MODE=0
# STEALTH_MODE=1
# Медиа музыки. Плейсхолдеры, не секреты из репозитория.
# В production без драйвера загрузка и отдача отвечают 503.
# OBJECT_STORAGE_DRIVER=local
# OBJECT_STORAGE_LOCAL_DIR=/var/lib/tuleneva/media
# OBJECT_STORAGE_DRIVER=s3
# S3_ENDPOINT=https://s3.example.com
# S3_REGION=us-east-1
# S3_BUCKET=tuleneva-media
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_FORCE_PATH_STYLE=true
# Если curl к api.telegram.org с VPS даёт exit 28 — Cloudflare Worker
# (скрипт deploy/cloudflare-telegram-proxy.js) и webhook:
# TELEGRAM_API_ROOT=https://<имя>.workers.dev/<длинный-PREFIX>
# TELEGRAM_WEBHOOK_SECRET=openssl_rand_hex_32
# STUDIO_CHAT_ID=           # заполнить после /chatid в чате студии
# TELEGRAM_NOTIFY_TIMEOUT_MS=8000
# SMTP для писем подтверждения почты и сброса пароля
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

Шаблон: [deploy/nginx-tuleneva.conf](../deploy/nginx-tuleneva.conf). Корень статики — `/var/www/tuleneva/current/dist`. Проксируйте `/api`, `/music` и `/ws` на `127.0.0.1:3000`.

CD конфиг Nginx **не** выкладывает. Блоки `location /music` и заголовки `X-Forwarded-For` / `X-Real-IP` нужно вписать в живой файл руками (и `listen 80`, и `listen 443` после certbot), затем `sudo nginx -t && sudo systemctl reload nginx`. Без `X-Forwarded-For` лимиты по IP видят один адрес `127.0.0.1`. `TRUST_PROXY` по умолчанию `loopback`: Express верит заголовку только от локального Nginx.

```bash
sudo cp /path/to/nginx-tuleneva.conf /etc/nginx/sites-available/tuleneva
sudo ln -sfn /etc/nginx/sites-available/tuleneva /etc/nginx/sites-enabled/tuleneva
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tuleneva25.ru
```

После смены `root` на `current/dist` Nginx reload один раз; дальше CD только переключает symlink и не перезагружает Nginx.

### Кэш: index.html и /assets/

Без этих заголовков iOS/Telegram оставляет старый `index.html`. После деплоя `current` указывает на новый `dist`, старых файлов `/assets/*-<hash>.js` по URL уже нет, а `try_files` подставляет вместо них HTML. Ленивый чанк админки не исполняется, React не монтируется, экран белый. Обновление страницы запрашивает свежий HTML и всё оживает.

Certbot уже создал блок `listen 443`. Не затирайте весь сайт шаблоном, если в нём есть `ssl_certificate`: вставьте те же `location` в живой server (и 80, и 443).

```nginx
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
}

location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

# Open Graph для /music собирает Node. Без этого блока Nginx отдаёт один и тот же index.html.
# X-Forwarded-For нужен и здесь, и в location /api/ и /ws (см. полный шаблон).
location /music {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
# проверка снаружи:
curl -sI https://tuleneva25.ru/ | grep -i cache-control
curl -sI https://tuleneva25.ru/assets/ | head -n 1
```

У `/` в ответе должен быть `no-cache` (внутренний редирект на `index.html`). Несуществующий файл в `/assets/` должен быть `404`, не `200` с HTML.

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

Запасная копия на своей машине — скачать последний каталог дампа (подставьте IP и путь из `BACKUP_DIR`):

```bash
# На VPS: ls -1dt /var/backups/tuleneva/*/ | head -1
scp -r deploy@IP:/var/backups/tuleneva/YYYYMMDDTHHMMSSZ ./tuleneva-mongo-backup
```

Второй Mongo и запись с локального приложения в отдельную базу не нужны: правки идут в живую Mongo через `npm run dev` (прокси на VPS) после входа по почте.

### Медиа на диске (`OBJECT_STORAGE_DRIVER=local`)

Файлы музыки не входят в `mongodump`. Скрипт [server/scripts/backup-media.sh](../server/scripts/backup-media.sh) кладёт каталог в `tar.gz` и оставляет последние `RETAIN` архивов (по умолчанию 14). Скопируйте его отдельно от релиза, как и дамп Mongo, например в `/usr/local/bin/backup-media.sh`.

```bash
sudo mkdir -p /var/lib/tuleneva/media /var/backups/tuleneva-media
# В /etc/tuleneva/backup.env добавьте (каталог бэкапа — другой диск, если есть):
#   MEDIA_DIR=/var/lib/tuleneva/media
#   MEDIA_BACKUP_DIR=/var/backups/tuleneva-media
#   RETAIN=14
#
# cron, на несколько минут позже дампа Mongo:
# 20 3 * * * set -a; . /etc/tuleneva/backup.env; set +a; /usr/local/bin/backup-media.sh >> /var/log/tuleneva-media-backup.log 2>&1
```

Тот же каталог можно гонять `rsync -a --delete` на другой диск. Скрипт выше — вариант с архивом и сроком хранения.

Восстановление: остановить API, распаковать архив так, чтобы путь совпал с `OBJECT_STORAGE_LOCAL_DIR` (внутри архива каталог с тем же именем, что у `MEDIA_DIR`), затем поднять API. Ключи в Mongo (`audioKey`, `coverKey`) должны указывать на те же относительные пути.

### S3

Скрипт диска бакет не копирует. Включите versioning бакета или отдельный sync (`aws s3 sync` / rclone) в другой бакет или на диск. При восстановлении объекты должны вернуться в тот же бакет и те же ключи, что записаны в документах.

## 9. Восстановление пользователей после потери диска

1. Попросите у хостера снимок диска или `/var/lib/mongodb` / готовый `mongodump`. Для локальных файлов музыки — архив из §8 или сам каталог `OBJECT_STORAGE_LOCAL_DIR`. Для S3 — версию бакета или копию sync.
2. Если дамп есть **до** того, как люди заново зарегистрировались: `mongorestore` коллекций `users` и `rehearsals` со старыми `_id` — слоты снова привязаны к людям. Вместе с ними восстанавливайте `musictracks`, `musiccollections` и `music_events` (модели `MusicTrack`, `MusicCollection`, `MusicEvent`). Полный `mongorestore` дампа это уже включает.
3. Если люди уже созданы заново, а дамп пришёл позже: не вставляйте старых users поверх (конфликт `telegram_id`). Сопоставьте по `telegram_id` и перепишите `rehearsals.hours[].userId` со старого `_id` на новый. Записи и подборки ссылаются на `createdBy` / `updatedBy` и, в событиях, на `userId`: после смены `_id` эти поля указывают на старых людей, каталог при этом читается.
4. Медиа поднимите в тот же драйвер и те же ключи, что в документах. Без файлов каталог откроется, а MP3 и обложки ответят 404. Локальный каталог распакуйте в `OBJECT_STORAGE_LOCAL_DIR`. Для S3 верните объекты в тот же бакет.
5. Почты в старой базе не было — после восстановления каждый привязывает почту в мини-приложении («Вход в браузере») или админ задаёт почту и временный пароль в `/admin`.

Бывшие участники без дампа: одна ссылка в общий чат, затем закрыть её.

1. Войдите своим `super_admin` и откройте админку.
2. «Пригласить пользователя» → включите «Ссылка для общего чата» (роль станет «Пользователь») → сгенерируйте.
3. Отправьте в чат Telegram-ссылку. Каждый, кто откроет её в мини-приложении, сразу получит роль `user`.
4. Когда все нужные люди прошли — «Закрыть ссылку». Новые регистрации по ней прекращаются. Сама ссылка погаснет через 7 дней, даже если забыть закрыть.
5. Почту каждый привязывает сам после входа или вы задаёте её в админке.

## 10. Telegram: Worker + webhook (когда api.telegram.org таймаутится)

Проверка с VPS:

```bash
curl -I --max-time 10 https://api.telegram.org; echo "exit:$?"
# exit:28 → исходящий Bot API с этой машины не работает
```

1. Cloudflare Dashboard → Workers → Create → вставить [deploy/cloudflare-telegram-proxy.js](../deploy/cloudflare-telegram-proxy.js).
2. Заменить `PREFIX` на длинный секрет (`openssl rand -hex 24`).
3. Deploy → скопировать URL вида `https://tuleneva-tg.workers.dev`.
4. В `/etc/tuleneva/api.env`:
   ```env
   TELEGRAM_API_ROOT=https://tuleneva-tg.workers.dev/<PREFIX>/
   TELEGRAM_WEBHOOK_SECRET=<другая_случайная_строка>
   # Важно: слэш в конце PREFIX обязателен (иначе Telegraf отбрасывает PREFIX).
   # Если getWebhookInfo → Connection timed out на VPS — webhook через Worker:
   # TELEGRAM_WEBHOOK_URL=https://tuleneva-tg.workers.dev/<PREFIX>/hook
   # (в коде Worker: PREFIX, ORIGIN_WEBHOOK, WEBHOOK_SECRET — см. cloudflare-telegram-proxy.js)
   ```
5. `sudo systemctl restart tuleneva-api`. В логе: `Telegram webhook set: https://tuleneva25.ru/api/telegram/webhook`.
6. Добавьте бота в чат студии, напишите `/chatid` (нужен admin в БД), пропишите `STUDIO_CHAT_ID=...`, снова restart.
7. Проверьте `/today` в чате. Бронь в мини-приложении приходит админам в личку и не появляется в чате студии.

Без `TELEGRAM_WEBHOOK_SECRET` процесс пытается long polling — на VPS с блокировкой Telegram это бесполезно, API при этом остаётся живым.

## 11. Проверка

- `curl -s http://127.0.0.1:3000/api/health` — `{"ok":true,"mongo":"connected"}` (CD смотрит этот URL).
- `readlink /var/www/tuleneva/current` — указывает на `releases/<sha>`.
- Мини-приложение: вход Telegram, запрос доступа, бронь.
- Браузер: `/app` → «Войти по почте» → модалка; «Забыли пароль?» → письмо `/app?passwordReset=...`. Кнопка «Войти по почте» попадает в сборку только если на **сборке** клиента задан `VITE_EMAIL_AUTH_UI=true`. Это переменная Vite, не `api.env`: правка на VPS после деплоя кнопку не покажет. Текущий workflow CD её не задаёт, поэтому на выложенном сайте кнопки нет, пока сборку не перезапустят с флагом. Модалка сброса по `?passwordReset=` и форма привязки почты у admin/super_admin от флага не зависят.
- SMTP задан: привязка почты шлёт `/app?emailConfirm=...`; после web-инвайта предлагается привязать почту.
- `systemctl status tuleneva-api` — один процесс; второй инстанс не поднят.

## 12. Обновление (CD)

На push в `main` / `master` после зелёных тестов GitHub Actions:

1. Собирает клиент (`dist/`) и серверный бандл (`server/dist/index.cjs`).
2. Пакует архив и по SSH (`deploy`) загружает на VPS.
3. Запускает [deploy/remote-release.sh](../deploy/remote-release.sh): `npm ci --omit=dev`, переключение `current`, `systemctl restart tuleneva-api`, healthcheck, при сбое — откат на предыдущий релиз, prune (оставляет 3 последних).

Перед выкладкой job `server` выполняет шаг **Check production requires**: во временный каталог копируются `package.json` и lock, там `npm ci --omit=dev`, затем [server/scripts/checkProdRequires.mjs](../server/scripts/checkProdRequires.mjs) проверяет, что каждый `require` в `dist/index.cjs` резолвится. Так не уезжает бандл, которому на VPS не хватит пакета. Импорт в рантайме из сервера или `shared/` должен быть в `dependencies` сервера.

Nginx этот пайплайн не обновляет. После правки шаблона (`/music`, `X-Forwarded-For`, `X-Real-IP`) те же `location` нужно перенести в живой конфиг на VPS и сделать reload.

Ручной `git pull` + `npm run build` на сервере **не** используется.

## 13. Секреты GitHub Actions

В настройках репозитория → Secrets and variables → Actions добавьте:

| Secret | Значение |
|--------|----------|
| `VPS_HOST` | IP или hostname VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Приватный ключ (ed25519), пара к `authorized_keys` |
| `VPS_KNOWN_HOSTS` | Вывод `ssh-keyscan -H <host>` |

Workflow: [.github/workflows/test.yml](../.github/workflows/test.yml), job `deploy` только на `push` в `main`/`master` (не на pull request). Concurrency `production-deploy` не отменяет уже идущий деплой.
