# Reminders: texts and rules
Source of truth for `internal/services/reminders.go` (pure functions; time and timezone as parameters), `reminder_services.go`, `web/src/sw.ts`, `pushPayload.ts`. Section names are cited from code ("Уведомления: тексты и правила", "3. Дедлайн скоро").

## Уведомления: тексты и правила
Server sends push JSON `{"title": "…", "body": "…", "url": "/day", "tag": "plan-morning"}`. Service worker shows it via `showNotification(title, { body, tag, data: { url }, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'ru' })`. A repeat with the same `tag` replaces the previous one.
All texts use the user's local time (`Timezone`); dates/durations per [formats](../foundations/formats.md).

### 1. Утро: «составь план»
- **When:** at `MorningTime` (default 08:00) if `MorningEnabled`, **no plan for today yet** (no `Day` with today's local date) and at least one active task. At most once a day.
- **Title:** "Составьте план на сегодня"
- **Body:** if some active task has a deadline today or tomorrow: "Активных задач: 9. Ближе всего срок у «Подготовить отчёт по ТИПИС» — сегодня, 18:00."; otherwise "Активных задач: 9. Сколько времени готовы отдать делам сегодня?"
- **Click:** `/day`. **tag:** `plan-morning`. **TTL:** 3 h.

### 2. Вечер: «отметь сделанное»
- **When:** at `EveningTime` (default 21:00) if `EveningEnabled`, today's plan exists and has tasks with `Status = 1`. No plan or all done -> not sent.
- **Title:** "Отметьте, что сделали сегодня"
- **Body:** first two plan tasks by `Priority` desc and the rest: "В плане осталось 3 из 7: «Подготовить отчёт по ТИПИС», «Пробежка 5 км» и ещё 1."; one task: "В плане осталась 1 задача из 7: «Пробежка 5 км»."; names longer than 40 chars are cut with "…".
- **Click:** `/day`. **tag:** `plan-evening`. **TTL:** 2 h.

### 3. «Дедлайн скоро»
- **When:** checked every minute. Task with `Status = 1`, `now < Deadline <= now + DeadlineHoursBefore`, and no notification yet for the pair `(TaskId, Deadline)`. If the deadline moves, a new notification may follow.
- **Not right after creation:** a task created < 30 minutes ago is postponed (stays in the window on later checks).
- **Quiet hours** (if `QuietEnabled`; default 23:00–07:00, by `Timezone`): "Дедлайн скоро" falling into `[QuietFrom, QuietTo)` is postponed until `QuietTo` if the deadline has not passed by then (else not sent). The interval may cross midnight (`QuietFrom > QuietTo`: 23:00–07:00 = 23:00…23:59 and 00:00…06:59). Morning and evening reminders ignore quiet hours.
- **Title:** task name (up to 60 chars, then "…"): "Подготовить отчёт по ТИПИС"
- **Body:** "Дедлайн через 2 ч 50 мин — сегодня, 18:00. Осталось ≈ 1:50 работы."
  - "Осталось" = `TimeForExecution * (100 - PercentOfCompleting) / 100`, rounded to 5 min, `Ч:ММ`;
  - if work exceeds the time left: "Дедлайн через 2 ч 50 мин — сегодня, 18:00. Работы ≈ 4:00 — больше, чем осталось времени.";
  - "через N": under an hour "через 45 мин", else "через 2 ч 50 мин" / "через 3 ч". Computed from `Deadline` and current time, not from stored `HoursUntilDeadline`.
- **Click:** `/tasks/:TaskId`. **tag:** `deadline-<TaskId>`. **TTL:** until `Deadline`. **Urgency:** `high`.
- **Summary:** if one check finds 3+ tasks (e.g. right after enabling), send one notification: title "3 дедлайна в ближайшие 3 ч"; body "Подготовить отчёт по ТИПИС — 18:00, Код-ревью задачи по API — 19:30 и ещё 1"; click `/all-tasks`, tag `deadline-summary`.

### 4. Тестовое
Title "Уведомления работают"; body "Так будут приходить напоминания о плане и дедлайнах."; click `/profile`; tag `test`; TTL 5 min.

## Delivery rules
- Scheduler: goroutine ticking every minute, stopped by context; for each user with subscriptions checks rules 1–3.
- No repeats: table `notification_log` (`UserId`, `Kind` morning|evening|deadline, `TaskId`, `Key` = local date `YYYY-MM-DD` for morning/evening, `Deadline` RFC3339 for deadline, `SentAt`), unique index `(UserId, Kind, TaskId, Key)`; the row is written before sending, in one transaction with the check.
- Missed times: after a restart a morning/evening reminder is sent only while its TTL has not expired (3 h / 2 h).
- Dead subscriptions: push service answered 404/410 (403 after key change) -> subscription deleted.
- Push headers: `TTL` from the rules above; `Urgency: high` for deadline, others `normal`; `Topic` = `tag`.
- VAPID keys, endpoints and settings DTOs: see the API table in `CLAUDE.md` and `internal/services/push_services.go`.
- Settings validation: time must be `ЧЧ:ММ` ("Неверное время: ожидается ЧЧ:ММ, например 08:00"); `deadlineHoursBefore` 1–24 ("За сколько часов: от 1 до 24"); final `QuietFrom = QuietTo` is rejected ("Тихие часы: начало и конец не могут совпадать"; check the resulting values, not only the sent ones); crossing midnight is allowed; bad timezone ("Неизвестный часовой пояс").
- Defaults: all three reminders on (08:00, 21:00, 3 h before), quiet 23:00–07:00.
