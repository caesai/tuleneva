# Запуск Tuleneva на новом VPS

Инструкция для Ubuntu LTS. Клиент — статика Nginx, API и бот — Node через systemd, данные — MongoDB только на `127.0.0.1`.

## 1. Пакеты

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx gnupg curl

# Репозиторий MongoDB (официальный; пакет mongodb-org иначе не найдётся)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Node 18+ (через nodesource или nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

MongoDB слушает только localhost и требует пользователя/пароль (см. документацию MongoDB `security.authorization`). Подставьте кодовое имя Ubuntu (`jammy`, `noble` и т.д.) в URL репозитория MongoDB.

## 2. Репозиторий

```bash
sudo mkdir -p /var/www/tuleneva
sudo chown "$USER":"$USER" /var/www/tuleneva
cd /var/www/tuleneva
git clone <URL_РЕПОЗИТОРИЯ> .
```

## 3. Переменные окружения сервера

Файл `server/.env`:

```env
TELEGRAM_TOKEN=токен_от_BotFather
JWT_SECRET=длинная_случайная_строка
WEB_APP_BASE_URL=https://tuleneva25.ru
MONGO_URI=mongodb://tuleneva:ПАРОЛЬ@127.0.0.1:27017/test?authSource=admin
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
```

`JWT_SECRET` новый на каждом чистом деплое: старые токены перестанут действовать.

Сервис systemd идёт от `www-data` — сделайте `server/.env` читаемым для него:

```bash
sudo chown root:www-data /var/www/tuleneva/server/.env
sudo chmod 640 /var/www/tuleneva/server/.env
```

## 4. Установка и сборка

```bash
# API
cd /var/www/tuleneva/server
npm install
npm run build

# Клиент
cd /var/www/tuleneva
npm install --legacy-peer-deps
npm run build
# Статика окажется в dist/
```

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

`/etc/systemd/system/tuleneva-api.service`:

```ini
[Unit]
Description=Tuleneva API + Telegram bot
After=network.target mongod.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/tuleneva/server
EnvironmentFile=/var/www/tuleneva/server/.env
ExecStart=/usr/bin/node /var/www/tuleneva/server/dist/index.cjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tuleneva-api
sudo systemctl status tuleneva-api
```

## 7. Nginx

Корень статики — `/var/www/tuleneva/dist`. Проксируйте `/api` и `/ws` на `127.0.0.1:3000`:

```nginx
server {
    listen 80;
    server_name tuleneva25.ru;

    root /var/www/tuleneva/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Authorization $http_authorization;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
sudo certbot --nginx -d tuleneva25.ru
sudo nginx -t && sudo systemctl reload nginx
```

В BotFather укажите Web App URL на `https://tuleneva25.ru/app` (или ваш актуальный путь мини-приложения).

## 8. Бэкапы MongoDB

Скрипт: [server/scripts/backup-mongo.sh](../server/scripts/backup-mongo.sh).

```bash
sudo mkdir -p /var/backups/tuleneva
sudo chmod +x /var/www/tuleneva/server/scripts/backup-mongo.sh

# Файл с URI (не кладите пароль в строку crontab — он виден в ps)
# /etc/tuleneva/backup.env:
#   MONGO_URI=mongodb://...
#   BACKUP_DIR=/mnt/backups/tuleneva
#
# cron (ежедневно в 03:15 UTC), каталог бэкапа — другой диск при возможности:
# 15 3 * * * set -a; . /etc/tuleneva/backup.env; set +a; /var/www/tuleneva/server/scripts/backup-mongo.sh >> /var/log/tuleneva-backup.log 2>&1
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

- `curl -s https://tuleneva25.ru/api/` — ответ API.
- Мини-приложение: вход Telegram, запрос доступа, бронь.
- Браузер: `/app` → «Войти по почте» → модалка с тем же аккаунтом (после подтверждения ссылки из письма).
- SMTP задан: привязка почты в мини-приложении или админке шлёт письмо со ссылкой `/app?emailConfirm=...`.
- Если уведомления бота молчат — задайте `TELEGRAM_API_ROOT` на хост, который видит Telegram Bot API.

## 11. Обновление

```bash
cd /var/www/tuleneva
git pull
cd server && npm install && npm run build
cd .. && npm install --legacy-peer-deps && npm run build
sudo systemctl restart tuleneva-api
```
