# Handoff: авторизация — актуальное состояние

Документ для следующего агента. План провайдеров и web/email **уже в коде**. Ниже — что сделано, что проверить на проде и что осталось вне scope.

---

## Что уже сделано

### Клиент
- [`src/contexts/AuthContext.tsx`](../src/contexts/AuthContext.tsx) — `authStatus`, `authProvider`, `capabilities`, сессия JWT, email login/link/confirm/forgot/reset.
- [`src/api/auth.api.ts`](../src/api/auth.api.ts) — нейтральные вызовы `/api/auth/*`.
- [`src/App.tsx`](../src/App.tsx) — инвайт `?invite=` / `tgWebAppStartParam`; после **web**-инвайта модалка привязки почты (можно закрыть).
- [`src/pages/TimeTablePage/TimeTablePage.tsx`](../src/pages/TimeTablePage/TimeTablePage.tsx) — «Войти по почте», «Забыли пароль?», сброс по `?passwordReset=`.
- UI по `capabilities`, не по сырым проверкам Telegram.

### Сервер
- [`server/auth/`](../server/auth/) — telegram, web, email (link/confirm/login/forgot/reset), invite.
- Web-инвайт: `POST /api/auth/invite/use` с `provider: 'web'` создаёт пользователя (не 501).
- Email: bcrypt, подтверждение письмом, сброс пароля отдельными полями `passwordReset*`.
- [`shared/studioHours.cjs`](../shared/studioHours.cjs) — сетка 12:00–23:00 и прошедшие слоты; `POST /api/book` отклоняет чужие часы и прошлое.
- [`GET /api/health`](../server/app.js) — 200 только при живой Mongo; CD: `deploy/remote-release.sh`.
- Telegram: webhook + `TELEGRAM_API_ROOT` (Cloudflare Worker), команды в [`server/telegram/createBot.js`](../server/telegram/createBot.js).

---

## Обязательно перед новой разработкой

1. Задеплоить фронт и API; в `api.env` при блокировке Telegram — Worker + `TELEGRAM_WEBHOOK_SECRET` (см. [VPS.md](VPS.md)).
2. Smoke: `GET /api/health`, Telegram login, web invite + привязка почты, бронь.

---

## Следующие шаги (не сделано в последнем проходе)

| Приоритет | Задача |
|-----------|--------|
| P2 | Список живых инвайтов / история (`GET /api/auth/invite/history`) |
| P2 | Журнал смен ролей |
| P3 | OAuth / phone-провайдер (enum есть, маршрутов нет) |
| P4 | Убрать legacy `/api/invite/*`, `/api/users/auth` после проверки клиентов |
| P5 | Rate limit на invite/use и telegram login; E2E Playwright |

---

## Архитектура (кратко)

```
AuthContext
  → auth.api.ts
  → /api/auth/session | providers/* | invite/*
  → identityService + providers
  → User + identities[]
```

**UI:** только `useAuth().capabilities` и `authStatus`.

**API:** fetch-функции без префикса `use*`.

---

## Известные ограничения

| Ограничение | Где |
|-------------|-----|
| Web без почты: JWT 1 сутки, повторный инвайт = новый user | webProvider, tokenService |
| Сброс пароля и привязка требуют SMTP | mailer.js |
| Telegram CDN аватарки | SafeAvatar |
| Notify с таймаутом; на VPS нужен `TELEGRAM_API_ROOT` | telegramNotify.js |

---

## Ключевые endpoint'ы

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/auth/session` | Сессия |
| POST | `/api/auth/providers/telegram/login` | Вход Telegram |
| POST | `/api/auth/providers/email/login` | Вход по почте |
| POST | `/api/auth/providers/email/forgot` | Сброс: письмо |
| POST | `/api/auth/providers/email/reset` | Сброс: новый пароль |
| POST | `/api/auth/invite/use` | Инвайт (`telegram` / `web`) |
| GET | `/api/health` | Mongo liveness |
| POST | `/api/telegram/webhook` | Бот (если секрет задан) |
