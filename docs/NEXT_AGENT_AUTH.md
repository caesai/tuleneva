# Handoff: расширяемая авторизация — следующие шаги

Документ для следующего агента. План из `.cursor/plans/auth_providers_roadmap_*.plan.md` **уже реализован в коде** (не редактировать plan-файл). Ниже — что сделано, что проверить на проде и что делать дальше.

---

## Что уже сделано

### Клиент
- [`src/contexts/AuthContext.tsx`](../src/contexts/AuthContext.tsx) — нейтральный контракт: `authStatus`, `authProvider`, `capabilities`, восстановление сессии по JWT (`GET /api/auth/session`).
- [`src/api/auth.api.ts`](../src/api/auth.api.ts) — `loginWithTelegram`, `requestAccessWithTelegram`, `applyInviteWithProvider`, `getAuthSession`.
- [`src/auth/telegramAuth.ts`](../src/auth/telegramAuth.ts) — сборка Telegram payload.
- [`src/types/auth.types.ts`](../src/types/auth.types.ts) — типы и `buildAuthCapabilities`.
- [`src/pages/TimeTablePage/TimeTablePage.tsx`](../src/pages/TimeTablePage/TimeTablePage.tsx) — UI по `capabilities`, не по сырым проверкам Telegram.
- [`src/App.tsx`](../src/App.tsx) — инвайт из `tgWebAppStartParam` и `?invite=`.
- [`src/pages/AdminPage/AdminPage.tsx`](../src/pages/AdminPage/AdminPage.tsx) — две ссылки: Telegram Mini App + web.
- [`src/api/user.api.ts`](../src/api/user.api.ts) — старые методы помечены `@deprecated`, проксируют `auth.api`.

### Сервер
- [`server/models/User.js`](../server/models/User.js) — `telegram_id` optional (sparse unique), массив `identities[]`.
- [`server/models/InviteCode.js`](../server/models/InviteCode.js) — `purpose`, `initialRole`, `allowedProviders`, `usedBy`, `usedAt`.
- [`server/auth/`](../server/auth/) — `telegramProvider.js`, `identityService.js`, `tokenService.js`, `authRoutes.js`.
- [`server/index.js`](../server/index.js) — `app.use('/api/auth', ...)`, миграция legacy identities при старте, legacy `/api/users/*` для совместимости.

### Прочее (из предыдущих сессий)
- Graceful Telegram SDK вне Mini App, `SafeAvatar`, code splitting (`vendor-ui`).
- **Важно:** на проде могла остаться старая сборка с `vendor-mui` + `vendor-react` (ошибка `Cannot access 'ho' before initialization`). Нужен деплой свежего `dist/` с `vendor-ui-QsilPmE-.js`.

---

## Обязательно перед новой разработкой

1. **Задеплоить** фронт (`npm run build` → `dist/`) и перезапустить Node-сервер.
2. В `.env` сервера добавить при необходимости:
   ```env
   WEB_APP_BASE_URL=https://tuleneva25.ru
   JWT_SECRET=...
   TELEGRAM_TOKEN=...
   ```
3. **Проверить на проде:**
   - `index.html` не грузит `telegram.org/js/telegram-web-app.js`.
   - В HTML чанки: `vendor-ui-*.js`, не `vendor-mui` + `vendor-react` отдельно.
   - `GET /api/auth/session` с Bearer token возвращает пользователя.
   - Telegram Mini App: login, register, invite, бронирование.
   - Браузер без Telegram: только просмотр расписания; бронирование скрыто (`capabilities`).

---

## Следующие шаги (приоритет)

### P0 — Стабилизация продакшена
| # | Задача | Файлы / действия |
|---|--------|------------------|
| 1 | Деплой актуального `dist/` и рестарт API | CI / сервер `51.250.16.74` |
| 2 | Убедиться, что MongoDB миграция identities отработала (лог при старте: `Migrated N legacy telegram identities`) | `server/index.js` |
| 3 | Smoke-тест auth endpoints | `/api/auth/session`, `/api/auth/providers/telegram/login` |

### P1 — Web-провайдер (первый не-Telegram вход)
Сейчас `POST /api/auth/invite/use` с `provider: 'web'` возвращает **501 / not implemented**.

1. Добавить `server/auth/webProvider.js` (или `emailProvider.js`):
   - регистрация по инвайту: имя + опционально email, без `telegram_id`;
   - создание `User` + `identity: { provider: 'web', providerUserId: email или uuid }`.
2. Расширить `authRoutes.js` — ветка `provider === 'web'` в `invite/use`.
3. Клиент:
   - страница/модалка «Войти по ссылке-приглашению» для `?invite=` **вне Telegram**;
   - в `AuthContext.registerWithInvite` — не требовать `isInTelegram`, передавать `provider: 'web'` + форма.
4. Обновить [`src/App.tsx`](../src/App.tsx): для web-инвайта показывать форму, а не только Telegram flow.

### P2 — Админка инвайтов
| # | Задача |
|---|--------|
| 1 | В [`AdminPage`](../src/pages/AdminPage/AdminPage.tsx) — выбор `purpose`, `initialRole`, `allowedProviders` при генерации |
| 2 | Отображать `webInviteLink` и `telegramInviteLink` (частично есть) |
| 3 | Опционально: список использованных инвайтов (`usedBy`, `usedAt`) — нужен `GET /api/auth/invite/history` |

### P3 — Дополнительные провайдеры
- **Email + magic link** или **OAuth** (Google/Yandex): отдельные `identities`, endpoints `/api/auth/providers/email/*`.
- Унифицировать `requestAccess` — сейчас только Telegram.

### P4 — Уборка legacy
- Удалить дублирующие маршруты в `server/index.js`: `/api/invite/*`, `/api/users/auth`, если клиент полностью на `/api/auth/*`.
- Убрать `@deprecated` реэкспорты из `user.api.ts`, когда нет внешних потребителей.
- Удалить неиспользуемые дубликаты `parseQueryToNestedJson` / `verifyTelegramInitData` в `index.js` (уже есть в `telegramProvider.js`).

### P5 — UX и безопасность
- [`TimeTablePage`](../src/pages/TimeTablePage/TimeTablePage.tsx) header `Avatar` — заменить MUI `Avatar` на `SafeAvatar`.
- Rate limit на `/api/auth/providers/*` и `/api/invite/use`.
- Refresh token или более длинная сессия (сейчас JWT `1d`).

---

## Архитектура (кратко)

```
AuthContext
  → auth.api.ts (нейтральные вызовы)
  → /api/auth/session | /api/auth/providers/telegram/* | /api/auth/invite/*
  → identityService + telegramProvider
  → User (profile + role) + identities[]
```

**Правило для UI:** не проверять `isInTelegram` в страницах — только `useAuth().capabilities` и `authStatus`.

**Правило для API:** не называть обычные fetch-функции с префиксом `use*` (см. переименование `useInviteWithProvider` → `applyInviteWithProvider`).

---

## Известные ограничения

| Ограничение | Где |
|-------------|-----|
| В браузере нет входа без JWT (кроме будущего web-провайдера) | `AuthContext` |
| `register` / `registerWithInvite` требуют Telegram | `AuthContext.tsx` |
| Telegram CDN аватарки могут не грузиться без VPN | `SafeAvatar`, timeout 1.2s |
| `notifyAdmins` только через Telegram bot | `server/index.js` — нужен `telegram_id` у админа |
| ESLint: `NetworkContext.tsx` — `react-refresh/only-export-components` | не связано с auth |

---

## Полезные команды

```bash
npm run build          # клиент
npm run lint           # есть старый warning в NetworkContext
# сервер
node server/index.js   # или текущий process manager
```

## Ключевые endpoint'ы

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/auth/session` | Восстановление сессии (JWT) |
| POST | `/api/auth/providers/telegram/login` | Вход Telegram |
| POST | `/api/auth/providers/telegram/register` | Запрос доступа |
| POST | `/api/auth/invite/use` | Инвайт (`provider`, `telegram?`) |
| POST | `/api/auth/invite/generate` | Админ: код + ссылки |
| GET | `/api/auth/invite/validate/:code` | Проверка кода |

---

## Рекомендуемый порядок для следующего агента

1. P0 — деплой и проверка прода.
2. P1 — web invite + форма в браузере (минимальный второй провайдер).
3. P2 — улучшение AdminPage.
4. P4 — cleanup legacy после стабилизации.

Не начинать с OAuth/email, пока не работает стабильный web-invite flow end-to-end.
