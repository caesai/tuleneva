# Не срочно

Для агентов. Эти пункты не начинать, пока пользователь явно не попросил. Продуктовый бэклог — [NEXT.md](NEXT.md). По каждому пункту отдельно план, потом код. Поведение API не менять «заодно».

## Telegram из страницы расписания

`src/pages/TimeTablePage/TimeTablePage.tsx` импортирует `@/telegram/useSafeLaunchParams` и `@/telegram/env`. В [eslint.config.js](../eslint.config.js) для этого файла исключение: страницы и компоненты не должны тянуть `src/telegram/` и `@telegram-apps/sdk-react`.

Перенести чтение launch params и окружения в `useAuth().capabilities` или хелперы auth. После этого убрать блок исключения в ESLint. SDK по-прежнему только в `src/init.ts`, `src/telegram/`, `src/auth/telegramAuth.ts`, `src/contexts/AuthContext.tsx`. `telegram-ui` в страницах можно.

## Типы сервера дальше strictNullChecks

`strictNullChecks` и модели (`UserDoc`, `RehearsalDoc`, `InviteCodeDoc`, `RoleChangeLogDoc`) уже включены. В [server/tsconfig.json](../server/tsconfig.json) всё ещё выключены `noImplicitAny` и `useUnknownInCatchVariables`.

`as any` остаётся у Telegraf `Markup`, разбора JWT и `err.status` в почтовом провайдере. Это не модели.

Не включать оба флага сразу. Один флаг или один кластер `any`, затем `cd server && npm run typecheck` и `npm run test:all`.

## Мелочи сервера

- `afterResponse` как функция: Telegram-notify стартует только после `res.json`.
- Остановка heartbeat realtime до `server.close`.
- `/my` у бота на том же day-read, что `/today`.
