---
name: api-reference
description: TaskManager REST API reference — every endpoint, request/response shapes and their quirks (PascalCase responses, error codes, Day slots, push/VAPID, reminder scheduler, timezones). Use when calling, changing, testing or reviewing the API, or writing web/src/api clients.
---

# TaskManager API

All routes live under `/api` (`internal/api/routes.go`); other GET paths serve the SPA, unknown `/api/...` → 404 JSON.

## Endpoints

| Method | Path | Does |
|---|---|---|
| POST | `/api/tasks/` | create task |
| GET | `/api/tasks/:id` | task by id |
| POST | `/api/tasks/update/:id` | partial update: `name`, `description`, `deadline`, `timeForExecution`, `percentOfCompleting` (0–100), `groupId` (0 = no group), `status` (1 reopen, 2 done) |
| DELETE | `/api/tasks/:id` | delete task (+ its `day_tasks`, `group_tasks` rows) |
| POST | `/api/tasks/user/:user_id` | user's tasks; optional body filter `{status, groupId, date}` |
| POST | `/api/days/` | create day and build plan: `{date, userId, timeForTasks}` (15–960 min); time split among active tasks |
| GET | `/api/days/:id` | stored plan (reading never rebuilds) |
| POST | `/api/days/update/:id` | rebuild plan: `{timeForTasks}` (optional, 15–960); done tasks keep their minutes |
| DELETE | `/api/days/:id` | delete day |
| GET | `/api/days/user/:user_id` | user's days |
| POST | `/api/groups/` | create group |
| GET | `/api/groups/:id` | group by id |
| POST | `/api/groups/update/:id` | update `name`, `description`, `groupPriority` (1–10); weight change recalculates the group's tasks |
| POST | `/api/groups/reorder` | atomically set several weights: `{userId, groups: [{groupId, groupPriority}]}`; recalculates tasks, returns all user's groups |
| POST | `/api/groups/add/:id` | add task to group |
| DELETE | `/api/groups/:id` | delete group; its tasks become "no group" with recalculated priority |
| GET | `/api/groups/tasks/:id` | group's tasks |
| GET | `/api/groups/user/:user_id` | user's groups |
| GET | `/api/push/key` | public VAPID key `{"PublicKey": "…"}` (base64url) |
| POST | `/api/push/subscribe` | upsert device by `endpoint`: `{userId, endpoint, keys: {p256dh, auth}, userAgent}`; 201 new, 200 updated; response omits `P256dh`/`Auth` |
| DELETE | `/api/push/subscribe` | `{userId, endpoint}`; 404 if absent |
| POST | `/api/push/test` | `{userId, endpoint?}` (no endpoint → all devices) → `{"Sent": N}`; 404 no subscription, 410 push service rejected it (subscription deleted) |
| GET | `/api/notifications/settings/:user_id` | reminder settings; no row yet → 200 with defaults |
| POST | `/api/notifications/settings/:user_id` | partial upsert: `morningEnabled`, `morningTime`, `eveningEnabled`, `eveningTime`, `deadlineEnabled`, `deadlineHoursBefore` (1–24), `quietEnabled`, `quietFrom`, `quietTo`, `timezone`; times `HH:MM` |

## Contract

- Requests are camelCase (`userId`, `deadline`); **responses are model fields as-is** (`TaskId`, `UserId`, `DeadLine`, `Priority`) — models have no json tags. Change only in sync with `web/src/api/types.ts`.
- Dates RFC3339. Delete = `DELETE` method.
- Errors: `{"error": "<string>"}`. Codes: 201 created, 400 bad input/validation, 404 not found, 409 conflict (group name taken), 410 stale push subscription, 500 other. Business errors are declared in `internal/services/errors.go`; handlers answer via `respondError` / `respondBindingError` (`internal/api/handlers/errors.go`).
- Empty lists → 200 `[]` (never 404 or `null`).

## Domain rules

- Deadline must be ≥ 1 h from now. `NumberOfHoursUntilDL` (Tl) is recomputed from now on every task change; overdue → Tl = 1.
- `Status = 2` ⇔ `PercentOfCompleting = 100`. `Task.GroupId = 0` = no group.
- Group weight 1–10; group name unique per user, case-insensitive, trimmed.
- Durations (`TimeForExecution`, `Day.TimeForTasks`) are minutes; the UI shows `h:mm`.

## Day plan

- `Day.TimeForTasks` — minutes the user gives to tasks that day (0:15–16:00). Task count is not an input: there is no `amountOfTasks` in requests; `Day.AmountOfTasks` is just the plan size at build time.
- `Day.PriorityOfTheDay` — sum of `Priority` of the plan's unfinished tasks, computed on read, not stored.
- `Day.Slots` — `[{DayId, TaskId, Minutes}]` from table `day_tasks` (model `DayTask` via `SetupJoinTable`; columns `day_day_id`, `task_task_id`, `minutes`); returned by every day endpoint.
- Minutes come from `AllocateDayTime` (`internal/services/day_plan.go`, "pace + remainder" algorithm in `design/rules/day-allocation.md`): slot ≥ 15 min and a multiple of 5; the remainder is free time (not stored). The plan is fixed between rebuilds — checking a task off doesn't change minutes. All slots `Minutes = 0` → plan from the old version.

## Push and reminders

Spec: `design/rules/reminders.md` (texts, rules), `design/rules/push-states.md` (client states).

- VAPID keys: env `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (never written to DB), else the `vapid_keys` DB row, else the server generates a pair at startup. `VAPID_SUBJECT` defaults to `mailto:admin@localhost`. Changing keys breaks existing subscriptions (push service answers 403 → subscription deleted). Never log the private key.
- Subscription endpoints are accepted only from known push services (FCM, Mozilla, Apple, Windows — `pushServiceHosts` in `internal/services/push_services.go`); extra hosts via `PUSH_ENDPOINT_HOSTS` (comma-separated).
- Scheduler `ReminderServiceImpl.Run` (`internal/services/reminder_services.go`) runs every minute: morning, evening and "deadline soon" for users with subscriptions. Rules and texts are pure functions in `internal/services/reminders.go` (time and zone as parameters). Duplicates are blocked by `notification_log` (unique index `UserId, Kind, TaskId, Key`; written before sending). Push service 404/410/403 → subscription deleted.
- Reminder times are local to `NotificationSettings.Timezone` (IANA; empty → server zone). tzdata is embedded (`import _ "time/tzdata"` in `main.go`) because alpine has none.
