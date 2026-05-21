# Tuleneva Rehearsal Studio Booking App

Telegram Mini App и веб-клиент для бронирования времени в репетиционной студии «Тюленева 25».

## Технологический стек

**Frontend:** React, TypeScript, Vite, Telegram Apps SDK, React Router, CSS Modules

**Backend:** Node.js, Express, MongoDB, Mongoose, Telegraf, JWT, WebSocket (`/ws`)

**Тесты:** Vitest (клиент и сервер), Zod-контракты в `shared/contracts/`, integration через supertest + mongodb-memory-server. E2E (Playwright) — планируется отдельно.

## Функционал

- Просмотр расписания, бронирование и отмена слотов
- Авторизация: Telegram Mini App и **web invite** (`?invite=CODE`)
- Одноразовые инвайты с настраиваемыми `allowedProviders`
- WebSocket: события `booking_update`, `booking_cancel`

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
PORT=3000
```

```bash
npm start      # production
npm run dev    # nodemon
```

### Клиент

```bash
npm install --legacy-peer-deps
npm run dev
```

Для Telegram SDK локально приложение эмулирует среду Mini App в браузере.

## Тестирование

```bash
# Клиент (unit + UI)
npm test
npm run test:watch
npm run test:coverage

# Сервер (unit + contracts + integration)
cd server && npm run test:all
```

Integration-тесты используют in-memory MongoDB; внешний Mongo не нужен.

## API

### Auth (`/api/auth/*`)

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/auth/session` | Сессия по JWT |
| POST | `/api/auth/providers/telegram/login` | Вход Telegram |
| POST | `/api/auth/providers/telegram/register` | Запрос доступа |
| POST | `/api/auth/invite/use` | Регистрация по инвайту (`provider`, `telegram?`, `web?`) |
| POST | `/api/auth/invite/generate` | Админ: код и ссылки |
| GET | `/api/auth/invite/validate/:code` | Проверка кода |

### Пользователи и расписание

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/users` | Список пользователей (JWT) |
| PUT | `/api/users/:id/role` | Смена роли (admin+) |
| DELETE | `/api/users/:id` | Удаление (admin+) |
| GET | `/api/timetable?date=DD/MM/YYYY` | Занятые даты месяца |
| GET | `/api/hours?date=DD/MM/YYYY` | Слоты на день |
| POST | `/api/book` | Бронирование |
| DELETE | `/api/cancel` | Отмена |

### Deprecated (совместимость)

- `POST /api/users/auth` → `POST /api/auth/providers/telegram/login`
- `POST /api/users/register` → `POST /api/auth/providers/telegram/register`
- `POST /api/invite/*` → `POST /api/auth/invite/*`

## WebSocket

- Путь: `/ws`
- События: `booking_update`, `booking_cancel` (payload: `date`, `hours`, `timestamp`)

## Сборка и деплой

**Сервер:**

```bash
cd server && npm run build
node dist/index.cjs
```

**Клиент:**

```bash
npm run build
```

Статика из `dist/` раздаётся веб-сервером (Nginx и т.д.). Папка `dist/` в `.gitignore`.

Подробный handoff по auth: [docs/NEXT_AGENT_AUTH.md](docs/NEXT_AGENT_AUTH.md).

## Структура проекта

```
tuleneva/
├── server/
│   ├── app.js              # createApp() — Express без listen/bot.launch
│   ├── index.js            # bootstrap: Mongo, Telegraf, WebSocket
│   ├── auth/               # authRoutes, providers, inviteService
│   ├── models/
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
│   └── test/               # roleMatrix для server + client
├── docs/
└── README.md
```
