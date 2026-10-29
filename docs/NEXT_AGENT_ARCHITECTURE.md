# Handoff: углубление архитектуры

Документ для следующего агента. Чеклист углублений из architecture review (deep modules: маленький interface, большая implementation). Термины: **module**, **interface**, **seam**, **adapter**, **depth**, **locality**, **leverage**.

---

## Чеклист

### 1. [x] Collapse rehearsal booking into one module

**Сделано.** Book / cancel / day hours / month dates вынесены в [`server/booking/createBooking.js`](../server/booking/createBooking.js). Маршруты в [`server/app.js`](../server/app.js) — тонкий HTTP-адаптер (`status` / `body` / `afterResponse` + `safeNotify`).

| | |
|---|---|
| **Файлы** | `server/booking/createBooking.js`, `server/app.js` |
| **Interface** | `createBooking({ broadcastUpdate, notifyAdmins, notifyUser })` → `book`, `cancel`, `getDayHours`, `getMonthDates` |
| **Проверка** | `cd server && npm run test:all` и `npm test` — зелёные |
| **Вне scope (осталось)** | WebSocket registry в `index.js`, клиентский refetch, bot day-read |

---

### 2. [x] Realtime seam

**Сделано.** Registry, envelope и `/ws` вынесены в [`server/realtime/createBroadcast.js`](../server/realtime/createBroadcast.js). Bootstrap передаёт `publish` в `createApp` как `broadcastUpdate`; `attach(server)` / `stop()` — в [`server/index.js`](../server/index.js). Тесты: unit на фейковых клиентах + integration book → `booking_update` без PII.

| | |
|---|---|
| **Файлы** | `server/realtime/createBroadcast.js`, `server/index.js` |
| **Interface** | `createBroadcast()` → `publish`, `addClient`, `attach` → `stop` |
| **Проверка** | `cd server && npm run test:all` и `npm test` — зелёные |
| **Вне scope (осталось)** | Клиентский `useWebSocket` / два соединения / refetch — пункт 3 |

---

### 3. [x] One slot-visibility decision

**Сделано.** Имена в слотах только из `GET /api/hours` (`getDayHours` + `hourPrivacy`). Push остаётся публичной занятостью дня; [`useTimeTableData`](../src/hooks/useTimeTableData.ts) на `booking_*` всегда делает refetch и не пишет `data.hours` в `bookedHours`. Тесты: `hoursPrivacy` integration + `useTimeTableData.test.tsx`.

| | |
|---|---|
| **Файлы** | `src/hooks/useTimeTableData.ts`, `server/booking/createBooking.js` |
| **Правило** | Push = календарь; PII = только HTTP по роли зрителя |
| **Проверка** | `cd server && npm run test:all` и `npm test` — зелёные |
| **Вне scope (осталось)** | Два `useWebSocket` на страницах, bot day-read |

---

### 4. [ ] Narrow the session module

| | |
|---|---|
| **Файлы** | [`src/contexts/AuthContext.tsx`](../src/contexts/AuthContext.tsx), [`src/App.tsx`](../src/App.tsx), TimeTable / Admin invite flows |
| **Проблема** | Invite и sign-in размазаны по страницам; interface контекста почти равен списку fetch |
| **Вне scope** | Не трогать auth pages в этом чеклисте, пока не выбран этот пункт |

См. также [NEXT_AGENT_AUTH.md](NEXT_AGENT_AUTH.md).

---

### 5. [ ] One role lattice

| | |
|---|---|
| **Файлы** | [`server/auth/roleHelpers.js`](../server/auth/roleHelpers.js), [`src/utils/rolePermissions.ts`](../src/utils/rolePermissions.ts), [`shared/test/roleMatrix.ts`](../shared/test/roleMatrix.ts) |
| **Проблема** | Два shallow module с одной матрицей прав; синхрон через тесты, не через shared runtime |
| **Вне scope** | Оставляем дублирование `roleHelpers` / `rolePermissions` до явного выбора |

---

### 6. [ ] One day-read for HTTP and the bot

| | |
|---|---|
| **Файлы** | [`server/telegram/createBot.js`](../server/telegram/createBot.js) (`loadHoursForDate`), `GET /api/hours` |
| **Проблема** | Бот читает тот же день без `normalizeHoursData` / hourPrivacy |
| **Вне scope** | Пока bot остаётся на своём query |

---

## Порядок

1 → (частично закрывает publish/visibility внутри booking) → 2 → 3 → 4–6 по необходимости.

## Проверка после пунктов 1–3

```bash
cd server && npm run test:all
npm test   # из корня
```

Smoke: бронь в двух вкладках — календарь обновляется по WS, имена на выбранном дне после refetch; гость/аноним без PII в `GET /api/hours`.
