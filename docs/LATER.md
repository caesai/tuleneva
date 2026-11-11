# Не срочно

Для агентов. Эти пункты не начинать, пока пользователь явно не попросил. Продуктовый бэклог — [NEXT.md](NEXT.md). По каждому пункту отдельно план, потом код. Поведение API не менять «заодно».

## Типы сервера дальше strictNullChecks

`strictNullChecks` и модели (`UserDoc`, `RehearsalDoc`, `InviteCodeDoc`, `RoleChangeLogDoc`) уже включены. В [server/tsconfig.json](../server/tsconfig.json) всё ещё выключены `noImplicitAny` и `useUnknownInCatchVariables`.

`as any` остаётся у Telegraf `Markup` (`server/app.ts`, `server/telegram/createBot.ts`) и в двух местах рядом с Telegram: `server/notifications/telegramNotify.ts:64` (`err.code`) и `server/telegram/createBot.ts:303` (`ctx.chat.is_forum`). Разбора JWT через `as any` больше нет. Статусы почты идут через `EmailAuthError`.

Не включать оба флага сразу. Один флаг или один кластер `any`, затем `cd server && npm run typecheck` и `npm run test:all`.
