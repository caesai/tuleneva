# Правила для AI-агентов (Tuleneva)

Документ обязателен для всех агентов, работающих в этом репозитории. Краткая версия для Cursor: `.cursor/rules/tuleneva-agents.mdc`.

---

## 1. Структура репозитория

| Путь | Назначение |
|------|------------|
| `src/` | **Клиент**: React + TypeScript, Vite |
| `server/` | **Бэкенд**: Express, Mongoose, Telegraf (TypeScript → бандл `dist/index.cjs`) |
| `shared/` | Общее между клиентом и сервером: Zod-контракты, `roleLattice`, `studioHours`, `roleMatrix` |
| `docs/` | Handoff и доменная документация |

**Не путать:** изменения API — в `server/`; вызовы API и UI — в `src/`. Синхронизировать оба слоя при смене контрактов.

---

## 2. Взаимодействие клиент ↔ сервер

### Точка входа сервера

- `server/index.ts` — bootstrap: MongoDB, Telegraf, WebSocket, `listen`
- `server/app.ts` — `createApp({ jwtSecret, botToken, ... })`: все HTTP-маршруты **без** `listen` (для тестов)
- Проверка типов сервера: `cd server && npm run typecheck` (`server/tsconfig.json`)

### Прокси в разработке и параллельные агенты

Vite (`vite.config.ts`) проксирует `/api` и `/ws` на **боевой** backend. Клиент ходит на относительные пути `/api/...`. Запись через локальный `npm run dev` попадает в прод-Mongo.

- Не гонять сценарии, которые пишут в боевую Mongo, из двух агентов одновременно.
- Не делать `git switch` / `git checkout` в общем checkout, пока в нём работает другой агент: используйте отдельные git worktree.
- Тяжёлые команды (`npm run check`, полный `test:all`) не запускать параллельно без нужды — делят CPU и MongoMemoryServer.

### Поток авторизации

```
src/contexts/AuthContext.tsx
  → src/api/auth.api.ts
  → GET/POST /api/auth/*
  → server/auth/authRoutes.ts
  → identityService / telegramProvider / webProvider / inviteService
  → MongoDB (User, InviteCode)
```

**Правила для UI:** не проверять «в Telegram ли мы» в страницах — использовать `useAuth().capabilities` и `authStatus`.

**Правила для API:** не называть обычные fetch-функции с префиксом `use*` (только React hooks).

### Роли

Источник правил: [`shared/roleLattice.ts`](shared/roleLattice.ts).

- Сервер: `server/auth/roleHelpers.ts` — тонкий адаптер (`canDeleteUser` по `_id`)
- Клиент: `src/utils/rolePermissions.ts` — тонкий адаптер с типами `TRole`
- Тесты: `shared/test/roleMatrix.ts` — гоняет оба адаптера; при смене правил править `roleLattice.ts`

### WebSocket

- Путь: `/ws`
- События: `booking_update`, `booking_cancel`
- Клиент подписывается через контекст сети / хуки расписания

### Актуальные эндпоинты auth

См. таблицу в [README.md](README.md). Открытые задачи: [docs/NEXT.md](docs/NEXT.md).

Legacy (`/api/users/register`, `/api/users/info`) — только для совместимости; новый код — `/api/auth/*`.

---

## 3. JSDoc (обязательно)

При **создании** или **существенном изменении** файла добавляй/обновляй JSDoc.

### TypeScript (`src/**/*.ts`, `src/**/*.tsx`, `server/**/*.ts`, `shared/**/*.ts`)

- Файл: краткий `@file` или блочный комментарий в начале (если модуль нетривиальный)
- Экспорты: `@description` для функций, компонентов, типов, хуков
- Параметры и возврат: `@param`, `@returns` где неочевидно
- Публичные API (`src/api/*`): описание контракта, ошибок, требований auth
- HTTP-обработчики сервера: `@route`, `@param`, `@returns` (как в `server/auth/telegramProvider.ts`, `server/app.ts`)

```typescript
/**
 * Восстанавливает сессию по JWT из localStorage.
 * @returns Ответ сервера; при 401 вызывающий код должен очистить токен.
 */
export const getAuthSession = async (): Promise<Response> => { ... }
```

```typescript
/**
 * Проверяет подпись Telegram Mini App init data.
 * @param initDataRaw Сырые query-параметры init data
 * @param botToken Токен бота
 * @returns true, если подпись верна
 */
const verifyTelegramInitData = (initDataRaw: string, botToken: string): boolean => { ... }
```

### Что не документировать

Очевидные однострочники, приватные хелперы без бизнес-смысла, автогенерируемый код.

### Язык

JSDoc — **на русском** (как в существующем коде сервера), если пользователь не попросил иначе.

---

## 4. Тесты (обязательная проверка)

После любого изменения логики **запусти тесты** и исправь регрессии:

```bash
# полный gate (lint + typecheck + клиентские и серверные тесты)
npm run check

# по отдельности
npm test
cd server && npm run test:all
```

### Когда писать новые тесты

| Ситуация | Действие |
|----------|----------|
| Мелкий фикс, рефакторинг без смены поведения | Достаточно зелёных существующих тестов |
| Новый эндпоинт / смена формата ответа | Zod-схема в `shared/contracts/` + contract test; integration при необходимости |
| Новая бизнес-логика (роли, инвайты, провайдеры) | Unit на server; при дублировании на клиенте — кейсы в `roleMatrix` |
| Новый UI-поток (модалки, формы, capabilities) | RTL-тест в `src/test/unit` |
| Только стили / текст кнопок | Тесты не обязательны |

### Инфраструктура

- Клиент: Vitest + Testing Library, тесты в `src/test/unit` и `src/test/contracts`, setup — `src/test/setup.ts`
- Сервер: Vitest + supertest + `mongodb-memory-server`, `server/test/helpers/testApp.ts`
- Общая матрица ролей: `shared/test/roleMatrix.ts`
- **Не** использовать `vi.clearAllMocks()` без восстановления моков — сбрасывает `mockResolvedValue`

### Контракты API

При изменении JSON-ответов обновляй `shared/contracts/auth.ts` (и связанные схемы) и contract-тесты на server/client.

---

## 5. Стиль и объём изменений

1. **Минимальный diff** — только то, что нужно для задачи; не рефакторить «заодно».
2. **Согласованность** — именование, структура папок, CSS Modules, `@/` alias как в соседних файлах.
3. **Без over-engineering** — не вводить лишние абстракции и обёртки.
4. **Секреты** — не коммитить `.env`, токены, ключи. В CI сканирует gitleaks (`.gitleaks.toml`).
5. **Git** — коммиты и push **только по явной просьбе** пользователя.
6. **README** — при добавлении env-переменных, эндпоинтов или команд обновляй [README.md](README.md).
7. **Deprecated** — не расширять legacy-маршруты `/api/users/*`; новое — в `/api/auth/*` и `auth.api.ts`. Список legacy заморожен тестом `server/test/unit/legacyUsersRoutes.freeze.test.ts`.
8. **Node** — CI и `.node-version` на 20; `engines` допускает 20 и новее.

---

## 6. Чеклист перед завершением задачи

- [ ] JSDoc добавлен/обновлён во всех затронутых **новых** и **изменённых** файлах
- [ ] Клиент и сервер согласованы (типы, API, роли, инвайты)
- [ ] `npm test` и `cd server && npm run test:all` — зелёные (или объяснено, почему нет)
- [ ] При смене API — обновлены Zod-контракты и при необходимости `roleMatrix`
- [ ] Нет лишних файлов и отладочного кода
- [ ] Пользователю кратко сказано, что проверить вручную (если затронут auth/Telegram/деплой)

---

## 7. Полезные команды

```bash
npm run check                     # lint + typecheck:all + клиентские и серверные тесты
npm run typecheck                 # только клиент (tsc -b)
npm run typecheck:all             # клиент + server
npm run dev                       # клиент (HTTPS, proxy /api на прод)
npm run build && npm run lint
npm test

cd server && npm run dev          # tsx watch index.ts
cd server && npm run typecheck
cd server && npm run test:all
cd server && npm run build        # dist/index.cjs
```

Установка клиента: `npm install --legacy-peer-deps` (peer-deps Telegram SDK).

---

## 8. Ссылки

- [README.md](README.md) — установка, API, тесты
- [docs/NEXT.md](docs/NEXT.md) — открытые задачи
- [docs/LATER.md](docs/LATER.md) — не срочно; не начинать без явной просьбы
- [docs/VPS.md](docs/VPS.md) — деплой и CD
- `server/test/helpers/testApp.ts` — пример поднятия app в тестах

