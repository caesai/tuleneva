# Tuleneva Rehearsal Studio Booking App

Telegram Mini App и веб-клиент для бронирования времени в репетиционной студии «Тюленева 25».

## Технологический стек

**Frontend:** React, TypeScript, Vite, Telegram Apps SDK, React Router, CSS Modules

**Backend:** Node.js, Express, MongoDB, Mongoose, Telegraf, JWT, WebSocket (`/ws`)

**Тесты:** Vitest (клиент и сервер), Zod-контракты в `shared/contracts/`, integration через supertest + mongodb-memory-server. E2E (Playwright) — планируется отдельно.

## Функционал

- Просмотр расписания, бронирование и отмена слотов. При `STEALTH_MODE` (по умолчанию включён) календарь `/app` только у людей из списка пользователей. Саморегистрация Telegram закрыта; инвайт администратора по-прежнему создаёт пользователя
- Авторизация: Telegram Mini App и **web invite** (`?invite=CODE`)
- Одноразовые инвайты с настраиваемыми `allowedProviders`
- WebSocket: события `booking_update`, `booking_cancel`, `users_update` (админка)
- Публичная музыка `/music`: слушать без входа. Публикует только `super_admin`

## Роли и права

| Роль | Описание |
|------|----------|
| `guest` | Только просмотр; бронирование после подтверждения |
| `user` | Свои брони |
| `admin` | Управление пользователями (кроме `super_admin`), любые отмены |
| `super_admin` | Полные права, назначение любых ролей |

**Матрица (кратко):** `admin` не назначает `super_admin` и не меняет роли `admin` / `super_admin`; не удаляет `admin` / `super_admin`. `super_admin` — без этих ограничений.

## Установка и запуск

### Требования

- Node.js 18+
- MongoDB (локально или облако)

### Сервер

```bash
cd server
npm install
```

`.env` в `server/` или корне проекта:

```env
TELEGRAM_TOKEN=ваш_токен_бота
JWT_SECRET=секретный_ключ
WEB_APP_BASE_URL=https://tuleneva25.ru
MONGO_URI=mongodb://127.0.0.1:27017/test
PORT=3000
# Календарь /app только для пользователей из базы. По умолчанию включено, переменную можно не задавать.
# Выключить позже: STEALTH_MODE=0
# STEALTH_MODE=1
# Опционально: таймаут одного Telegram-сообщения (мс), по умолчанию 8000
# TELEGRAM_NOTIFY_TIMEOUT_MS=8000
# Если api.telegram.org с VPS недоступен — Cloudflare Worker (см. docs/VPS.md):
# TELEGRAM_API_ROOT=https://<worker>.workers.dev/<секретный-префикс>/
# Webhook вместо long polling (нужен на VPS без исходящего доступа к Telegram):
# TELEGRAM_WEBHOOK_SECRET=длинная_случайная_строка
# Если Telegram не достучится до VPS (getWebhookInfo: Connection timed out):
# TELEGRAM_WEBHOOK_URL=https://<worker>.workers.dev/<префикс>/hook
# Чат студии: бот отвечает только на команды (/today и др.). Брони и отмены — админам в личку.
# STUDIO_CHAT_ID=-100...
# SMTP для подтверждения почты и сброса пароля (без SMTP_HOST привязка отвечает 503)
# Медиа музыки. В production без драйвера загрузка и отдача файлов отвечают 503.
# Вне production пустое значение — временный каталог ОС, не бакет студии.
# OBJECT_STORAGE_DRIVER=local
# OBJECT_STORAGE_LOCAL_DIR=/var/lib/tuleneva/media
# OBJECT_STORAGE_DRIVER=s3
# S3_ENDPOINT=https://s3.example.com
# S3_REGION=us-east-1
# S3_BUCKET=tuleneva-media
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_FORCE_PATH_STYLE=true
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
# MAIL_FROM=noreply@tuleneva25.ru
```

Деплой на новый VPS (Nginx, systemd, пользователь `deploy`, CD из Actions, первый `super_admin`, бэкапы): [docs/VPS.md](docs/VPS.md).

```bash
npm start      # production (node dist/index.cjs)
npm run dev    # tsx watch
```

### Клиент

```bash
npm install --legacy-peer-deps
npm run dev
```

Кнопка «Войти по почте» и форма привязки у обычных пользователей по умолчанию скрыты. Админ и супер-админ видят форму привязки своей почты в Mini App без флага (нужен SMTP на VPS).

Локальный Vite проксирует `/api` и `/ws` на `http://127.0.0.1:3000`. Другой стенд задаётся явно: `VITE_API_PROXY_TARGET=http://127.0.0.1:3000`. Проверка TLS включена. `VITE_API_PROXY_INSECURE=true` имеет смысл только для своего сертификата, не для боевого API.

Для Telegram SDK локально приложение эмулирует среду Mini App в браузере.

**SEO / Open Graph:** `index.html` собирается автоматически из `index.template.html` и `src/config/siteMeta.ts` при `npm run dev` и `npm run build`. Метатеги главной править в `siteMeta.ts`. Краулеры не исполняют JS: Nginx отдаёт `/` из этого файла, а `/music` и `/music/*` проксирует на Express. Express подставляет title и og:* из Mongo и отдаёт тот же SPA. Превью подборки — `GET /api/music/collections/:id/og.jpg` (JPEG 1200×630).

## Тестирование

```bash
# Полный quality gate (lint + typecheck:all + клиент + сервер)
npm run check

# Клиент (unit + UI)
npm test
npm run test:watch
npm run test:coverage

# Playwright smoke (расписание + вход по почте; поднимает Vite на :5173)
npx playwright install chromium
npm run test:e2e

# Сервер (unit + contracts + integration)
cd server && npm run typecheck
cd server && npm run test:all
```

Node 20 (см. `.node-version`). Integration-тесты используют in-memory MongoDB и память вместо бакета; внешний Mongo и S3 не нужны. Локальный Vite по умолчанию ходит на `http://127.0.0.1:3000`.

## API

### Auth (`/api/auth/*`)

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/auth/session` | Сессия по JWT. Нет токена, битый или просроченный — `200 { valid: false }`, не 401/403 |
| POST | `/api/auth/providers/telegram/login` | Вход Telegram |
| POST | `/api/auth/providers/telegram/register` | Запрос доступа |
| POST | `/api/auth/providers/email/login` | Вход по почте (API есть; кнопка и привязка скрыты, пока не задан `VITE_EMAIL_AUTH_UI=true`) |
| POST | `/api/auth/providers/email/link` | Привязка почты (JWT); письмо со ссылкой; `currentPassword` при смене |
| POST | `/api/auth/providers/email/confirm` | Подтверждение почты по токену из письма |
| POST | `/api/auth/providers/email/forgot` | Запрос сброса пароля (всегда 200; письмо только если почта подтверждена) |
| POST | `/api/auth/providers/email/reset` | Новый пароль по токену из письма (`?passwordReset=`) |
| POST | `/api/auth/invite/use` | Регистрация по инвайту (`provider`, `telegram?`, `web?`); rate limit по IP |
| POST | `/api/auth/invite/generate` | Админ: код и ссылки. `multiUse: true` — общая ссылка на 7 дней |
| POST | `/api/auth/invite/revoke` | Админ: закрыть инвайт по `{ code }` |
| GET | `/api/auth/invite/history` | Админ: живые инвайты и история (пока TTL не стёр) |
| GET | `/api/auth/invite/validate/:code` | Проверка кода |

### Пользователи и расписание

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/users` | Список пользователей (JWT) |
| PUT | `/api/users/:id/role` | Смена роли (admin+) |
| GET | `/api/users/:id/role-log` | Журнал смен ролей (admin+) |
| PUT | `/api/users/:id/email-login` | Админ: почта и пароль (письмо с подтверждением) |
| DELETE | `/api/users/:id` | Удаление (admin+) |
| GET | `/api/health` | Liveness CD: 200 при живой Mongo, иначе 503 |
| GET | `/api/timetable?date=DD/MM/YYYY` | Занятые даты месяца |
| GET | `/api/hours?date=DD/MM/YYYY` | Слоты на день (PII только с JWT участника, `role !== guest`) |
| POST | `/api/book` | Бронирование (часы 12:00–23:00, без прошедших слотов) |
| DELETE | `/api/cancel` | Отмена |
| POST | `/api/telegram/webhook` | Обновления бота (если задан `TELEGRAM_WEBHOOK_SECRET`) |

### Музыка

Гости слушают опубликованное без входа: страница `/music`, альбом `/music/album/:id`, плейлист `/music/playlist/:id` и старая ссылка на запись `/music/:id`. Черновики, загрузка, правка, публикация и снятие — только `super_admin` (роль из `shared/roleLattice.ts`). Обычный `admin` получает 403 на запись и не видит черновик (404). В Mongo лежат название, авторы, описание, ключи объектов и номер версии байтов. MP3 и обложка — в объектном хранилище.

Альбом или плейлист — отдельная коллекция с названием, описанием, обложкой, статусом и упорядоченным списком id. Запись может быть в одном альбоме и в нескольких плейлистах. Старые записи без подборки остаются как есть и на `/music` попадают в «Синглы», пока их не включат в опубликованный альбом или плейлист. Отдельная миграция базы не нужна.

Прослушивания считаются своим счётчиком, без Метрики и без рекламного блокатора. Браузер шлёт `POST /api/music/events`: `play_start` (звук реально пошёл), `play_complete` (около 90% или конец) и `share`. В документе коллекции `music_events` лежат тип, id записи и контекст альбома или плейлиста, время, метка источника и случайный id сессии из localStorage. Если участник студии в этот момент вошёл, пишется ещё его `userId`. IP и user-agent не сохраняются. Повтор того же прослушивания в ту же сессию в течение 30 минут схлопывается. Частота ограничена по IP в памяти процесса (60 запросов в минуту). `STEALTH_MODE` этот маршрут не закрывает. Сводка `GET /api/music/admin/stats` — только `super_admin`: за скользящие 7 дней и за всё время. Индексы объявлены на модели и создаются Mongoose при старте API, руками их строить не нужно. Новых переменных окружения нет. Рядом те же три цели уходят в уже подключённый счётчик Яндекс Метрики (`reachGoal`).

| Method | Path | Назначение |
|--------|------|------------|
| POST | `/api/music/events` | Анонимное событие `play_start`, `play_complete` или `share`. Без входа. Черновик — 404 |
| GET | `/api/music/admin/stats` | Сводка за 7 дней и счётчики по записям и подборкам. Только `super_admin` |
| GET | `/api/music/catalog` | Опубликованные альбомы и плейлисты и синглы без подборки |
| GET | `/api/music/collections/:id` | Подборка и записи по порядку. Черновик — 404, кроме супер-админа |
| GET | `/api/music/collections/:id/cover` | Обложка подборки. `?v=` — кэш на год, без `v` — перепроверка |
| GET | `/api/music/collections/:id/og.jpg` | JPEG 1200×630 для og:image. Только опубликованная подборка с обложкой. Кэш как у обложки |
| GET | `/api/music/admin/collections` | Все подборки, включая черновики |
| POST | `/api/music/admin/collections` | Черновик: JSON `type` (`album` или `playlist`), `title`, `description` |
| PATCH | `/api/music/admin/collections/:id` | Название, описание, файл `cover` |
| PUT | `/api/music/admin/collections/:id/tracks` | JSON `{ trackIds }` — состав и порядок |
| POST | `/api/music/admin/collections/:id/publish` | Публикация подборки |
| POST | `/api/music/admin/collections/:id/unpublish` | Снова черновик |
| DELETE | `/api/music/admin/collections/:id` | Удалить подборку и обложку, записи остаются |
| GET | `/api/music/tracks` | Опубликованные записи |
| GET | `/api/music/tracks/:id` | Одна опубликованная; черновик только супер-админу |
| GET | `/api/music/tracks/:id/audio` | MP3, заголовок `Range`. `?v=` — кэш на год, без `v` — перепроверка |
| GET | `/api/music/tracks/:id/cover` | Обложка, если есть. Кэш как у MP3 |
| GET | `/api/music/tracks/:id/og.jpg` | JPEG 1200×630 для og:image записи. Только опубликованная запись с обложкой. Кэш как у обложки |
| GET | `/api/music/admin/tracks` | Все записи, включая черновики |
| POST | `/api/music/tracks` | Черновик: поля `title`, `credits`, `description`, необязательный `albumId`, файл `audio`, необязательный `cover` |
| PATCH | `/api/music/tracks/:id` | Правка текста, файлов и, если передано поле `albumId`, альбома |
| POST | `/api/music/tracks/:id/publish` | Публикация |
| POST | `/api/music/tracks/:id/unpublish` | Снова черновик |
| DELETE | `/api/music/tracks/:id` | Удалить запись и файлы |

Лимиты: MP3 до 30 МБ, обложка JPEG/PNG/WebP до 2 МБ. Имя файла пользователя в ключ не попадает. Замена файла пишет в тот же ключ и тот же документ: id записи и подборки не меняются, статистика прослушиваний остаётся. В ответе карточки есть `audioVersion` и `coverVersion` (у подборки только `coverVersion`). Старый документ без поля читается как 0, отдельная миграция не нужна. Клиент добавляет `?v=` к URL обложки, MP3 и `og.jpg`. Опубликованный ответ с `?v=` кэшируется на год. Без `v` — `max-age=0, must-revalidate`. Черновик по-прежнему `private, no-store`.

**Хранилище ещё не подключено к продакшену.** Пока владелец не выберет провайдера и не положит секреты в `/etc/tuleneva/api.env`, боевая загрузка отвечает 503. Код не создаёт бакет и не содержит ключей.

| Переменная | Смысл |
|------------|--------|
| `OBJECT_STORAGE_DRIVER` | `s3`, `local` или `none`. В `NODE_ENV=production` пустое значение значит «не настроено». Вне production пустое значение — временный локальный каталог. |
| `OBJECT_STORAGE_LOCAL_DIR` | Каталог для `local`. Иначе системный temp. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Обязательны для `s3`. Без них драйвер не включается. |
| `S3_ENDPOINT` | Адрес совместимого API, если это не AWS. |
| `S3_REGION` | По умолчанию `us-east-1`. |
| `S3_FORCE_PATH_STYLE` | `true` для MinIO и части совместимых сервисов. |

Бакет остаётся приватным: файлы отдаёт API после проверки, опубликована запись или нет.

### Deprecated (совместимость)

- `POST /api/users/register` → `POST /api/auth/providers/telegram/register`
- `GET /api/users/info` → `GET /api/auth/session`

## Telegram-бот

На VPS в РФ исходящий доступ к `api.telegram.org` часто таймаутится. Тогда:

1. Cloudflare Worker из [deploy/cloudflare-telegram-proxy.js](deploy/cloudflare-telegram-proxy.js) → `TELEGRAM_API_ROOT`
2. `TELEGRAM_WEBHOOK_SECRET` — Telegram шлёт обновления на `POST /api/telegram/webhook`
3. Команды в чате студии (`STUDIO_CHAT_ID`): `/today`, `/tomorrow`, `/free`, `/help`. В общем чате слоты без имени того, кто забронировал. В личке ещё `/my` (только свои брони) и `/start`. Админ: `/chatid`. О брони и отмене бот пишет только админам в личный чат, в общий чат эти сообщения не дублирует.

Подробности: [docs/VPS.md](docs/VPS.md).

## WebSocket

- Путь: `/ws`
- События: `booking_update`, `booking_cancel` (payload: `date`, `hours`, `timestamp`); `users_update` (payload: `reason` — регистрация/инвайт/роль/удаление, админка перезагружает список)

## Сборка и деплой

**Сервер (локально):**

```bash
cd server && npm run build
node dist/index.cjs
```

**Клиент (локально):**

```bash
npm run build
```

Статика из `dist/` раздаётся веб-сервером. Папка `dist/` в `.gitignore`.

**Продакшен:** на push в `main` / `master` после зелёных тестов GitHub Actions выкладывает клиент и API на VPS (symlink `current`, systemd `tuleneva-api`). Секреты только в `/etc/tuleneva/api.env` на сервере и в GitHub Secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`). Шаблоны и скрипт релиза — каталог `deploy/`.

Полный чеклист нового сервера и CD: [docs/VPS.md](docs/VPS.md). Бэкап Mongo: `server/scripts/backup-mongo.sh`.

Открытые задачи: [docs/NEXT.md](docs/NEXT.md). Чеклист VPS: [docs/VPS.md](docs/VPS.md).

## Структура проекта

```
tuleneva/
├── server/
│   ├── app.ts              # createApp() — Express без listen/bot.launch
│   ├── index.ts            # bootstrap: Mongo, Telegraf, WebSocket
│   ├── auth/               # authRoutes, providers, inviteService
│   ├── booking/            # createBooking — book/cancel/day/month
│   ├── realtime/           # createBroadcast — publish /ws
│   ├── telegram/           # createBot, команды расписания
│   ├── models/
│   ├── dist/index.cjs      # esbuild-бандл для VPS
│   └── test/               # unit, contracts, integration
├── src/
│   ├── api/
│   ├── auth/
│   ├── contexts/
│   ├── pages/
│   ├── telegram/
│   └── utils/              # rolePermissions
├── shared/
│   ├── contracts/          # Zod-схемы API
│   ├── roleLattice.ts      # решётка ролей (server + client)
│   ├── studioHours.ts      # часы студии и «слот в прошлом»
│   └── test/               # roleMatrix для server + client
├── deploy/                 # remote-release.sh, systemd, nginx
├── docs/
└── README.md
```
