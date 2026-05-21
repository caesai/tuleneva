# Правила для AI-агентов (Tuleneva)

Документ обязателен для всех агентов, работающих в этом репозитории. Краткая версия для Cursor: `.cursor/rules/tuleneva-agents.mdc`.

---

## 1. Структура репозитория

| Путь | Назначение |
|------|------------|
| `src/` | **Клиент**: React + TypeScript, Vite |
| `server/` | **Бэкенд**: Express, Mongoose, Telegraf |
| `shared/` | Общее между клиентом и сервером: Zod-контракты, `roleMatrix` |
| `docs/` | Handoff и доменная документация |

**Не путать:** изменения API — в `server/`; вызовы API и UI — в `src/`. Синхронизировать оба слоя при смене контрактов.

---

## 2. Взаимодействие клиент ↔ сервер

### Точка входа сервера

- `server/index.js` — bootstrap: MongoDB, Telegraf, WebSocket, `listen`
- `server/app.js` — `createApp({ jwtSecret, botToken, ... })`: все HTTP-маршруты **без** `listen` (для тестов)

### Прокси в разработке

Vite (`vite.config.ts`) проксирует `/api` и `/ws` на production/staging backend. Клиент ходит на относительные пути `/api/...`.

### Поток авторизации

```
src/contexts/AuthContext.tsx
  → src/api/auth.api.ts
  → GET/POST /api/auth/*
  → server/auth/authRoutes.js
  → identityService / telegramProvider / webProvider / inviteService
  → MongoDB (User, InviteCode)
```

**Правила для UI:** не проверять «в Telegram ли мы» в страницах — использовать `useAuth().capabilities` и `authStatus`.

**Правила для API:** не называть обычные fetch-функции с префиксом `use*` (только React hooks).

### Роли

Логика прав дублируется осознанно:

- Сервер: `server/auth/roleHelpers.js` (источник истины для API)
- Клиент: `src/utils/rolePermissions.ts`
- Тесты: `shared/test/roleMatrix.ts` — **при изменении матрицы обновить все три места**

### WebSocket

- Путь: `/ws`
- События: `booking_update`, `booking_cancel`
- Клиент подписывается через контекст сети / хуки расписания

### Актуальные эндпоинты auth

См. таблицу в [README.md](README.md) и [docs/NEXT_AGENT_AUTH.md](docs/NEXT_AGENT_AUTH.md).

Legacy (`/api/users/auth`, `/api/invite/*`) — только для совместимости; новый код — `/api/auth/*`.

---

## 3. JSDoc (обязательно)

При **создании** или **существенном изменении** файла добавляй/обновляй JSDoc.

### TypeScript (`src/**/*.ts`, `src/**/*.tsx`)

- Файл: краткий `@file` или блочный комментарий в начале (если модуль нетривиальный)
- Экспорты: `@description` для функций, компонентов, типов, хуков
- Параметры и возврат: `@param`, `@returns` где неочевидно
- Публичные API (`src/api/*`): описание контракта, ошибок, требований auth

```typescript
/**
 * Восстанавливает сессию по JWT из localStorage.
 * @returns Ответ сервера; при 401 вызывающий код должен очистить токен.
 */
export const getAuthSession = async (): Promise<Response> => { ... }
```

### JavaScript (`server/**/*.js`)

- Стиль как в `server/auth/telegramProvider.js`, `server/app.js`
- `@param`, `@returns`, `@route` для HTTP-обработчиков в `app.js` / роутерах
- `@description` для middleware и бизнес-функций

```javascript
/**
 * Проверяет подпись Telegram Mini App init data.
 * @param {string} initDataRaw - Сырые query-параметры init data
 * @param {string} botToken - Токен бота
 * @returns {boolean}
 */
const verifyTelegramInitData = (initDataRaw, botToken) => { ... }
```

### Что не документировать

Очевидные однострочники, приватные хелперы без бизнес-смысла, автогенерируемый код.

### Язык

JSDoc — **на русском** (как в существующем коде сервера), если пользователь не попросил иначе.

---

## 4. Тесты (обязательная проверка)

После любого изменения логики **запусти тесты** и исправь регрессии:

```bash
# из корня — клиент
npm test

# сервер
cd server && npm run test:all
```

### Когда писать новые тесты

| Ситуация | Действие |
|----------|----------|
| Мелкий фикс, рефакторинг без смены поведения | Достаточно зелёных существующих тестов |
| Новый эндпоинт / смена формата ответа | Zod-схема в `shared/contracts/` + contract test; integration при необходимости |
| Новая бизнес-логика (роли, инвайты, провайдеры) | Unit на server; при дублировании на клиенте — кейсы в `roleMatrix` |
| Новый UI-поток (модалки, формы, capabilities) | RTL-тест в `src/**/*.test.tsx` |
| Только стили / текст кнопок | Тесты не обязательны |

### Инфраструктура

- Клиент: Vitest + Testing Library, `src/test/setup.ts`
- Сервер: Vitest + supertest + `mongodb-memory-server`, `server/test/helpers/testApp.js`
- Общая матрица ролей: `shared/test/roleMatrix.ts`
- **Не** использовать `vi.clearAllMocks()` без восстановления моков — сбрасывает `mockResolvedValue`

### Контракты API

При изменении JSON-ответов обновляй `shared/contracts/auth.ts` (и связанные схемы) и contract-тесты на server/client.

---

## 5. Стиль и объём изменений

1. **Минимальный diff** — только то, что нужно для задачи; не рефакторить «заодно».
2. **Согласованность** — именование, структура папок, CSS Modules, `@/` alias как в соседних файлах.
3. **Без over-engineering** — не вводить лишние абстракции и обёртки.
4. **Секреты** — не коммитить `.env`, токены, ключи.
5. **Git** — коммиты и push **только по явной просьбе** пользователя.
6. **README** — при добавлении env-переменных, эндпоинтов или команд обновляй [README.md](README.md).
7. **Deprecated** — не расширять legacy-маршруты; новое — в `/api/auth/*` и `auth.api.ts`.

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
npm run dev              # клиент (HTTPS, proxy /api)
npm run build && npm run lint
npm test

cd server && npm run dev
cd server && npm run test:all
```

Установка клиента: `npm install --legacy-peer-deps` (peer-deps Telegram SDK).

---

## 8. Ссылки

- [README.md](README.md) — установка, API, тесты
- [docs/NEXT_AGENT_AUTH.md](docs/NEXT_AGENT_AUTH.md) — детальный handoff по авторизации
- `server/test/helpers/testApp.js` — пример поднятия app в тестах
