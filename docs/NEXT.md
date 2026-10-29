# На будущее

Открытые задачи после углубления архитектуры (booking, realtime, visibility, invite entry, role lattice, day-read). Чеклист сервера: [VPS.md](VPS.md).

## Открыто

| Тема | Что сделать |
|------|-------------|
| Сессия | Сжать формы почты (вход / привязка / сброс) и узкий interface `AuthContext` — пункт 4 чеклиста не закрыт |
| WebSocket на клиенте | Один общий клиент вместо двух `useWebSocket` (расписание + админка) |
| Инвайты | Список живых / история (`GET /api/auth/invite/history`) |
| Роли | Журнал смен ролей |
| Auth | OAuth / phone (enum есть, маршрутов нет) |
| Legacy | Убрать `/api/users/auth`, `/api/invite/*` после проверки клиентов |
| Нагрузка / E2E | Rate limit на invite/use и telegram login; Playwright |

## Можно позже

- `afterResponse` как функция, старт Telegram-notify только после `res.json`
- Остановка heartbeat realtime до `server.close`
- `/my` у бота на том же day-read, что `/today`
