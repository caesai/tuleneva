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

### 2. [ ] Realtime seam

| | |
|---|---|
| **Файлы** | [`server/index.js`](../server/index.js), inject `broadcastUpdate` в `createApp`, [`src/hooks/useWebSocket.ts`](../src/hooks/useWebSocket.ts) |
| **Проблема** | Registry сокетов и envelope только в bootstrap; тесты подставляют no-op — нет test surface для production publish |
| **Вне scope** | Пока оставляем `broadcastUpdate` как injected function |

---

### 3. [ ] One slot-visibility decision

| | |
|---|---|
| **Файлы** | [`server/auth/hourPrivacy.js`](../server/auth/hourPrivacy.js), WS payload в booking, [`src/hooks/useTimeTableData.ts`](../src/hooks/useTimeTableData.ts) |
| **Проблема** | «Что видит зритель» расходится: HTTP sanitizes by role, push всегда public, клиент refetch при `canViewUserDetails` |
| **Вне scope** | Пока оставляем `hourPrivacy` и клиентский refetch как есть |

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

## Проверка после пункта 1

```bash
cd server && npm run test:all
npm test   # из корня
```

Smoke: `POST /api/book`, `DELETE /api/cancel`, `GET /api/hours`, `GET /api/timetable`.
