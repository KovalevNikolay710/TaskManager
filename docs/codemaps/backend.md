# Backend codemap

Generated 2026-10-06 after stage 3; update when a merge changes structure.

Layers: handler -> service -> repository. Module name `TaskManager`. Comments, logs, user errors are Russian.

## Routes (`internal/api/routes.go`, all under `/api`, handler -> service)

| Method path | Handler | Service method |
|---|---|---|
| POST /tasks/ | TaskHandler.CreateTask | TaskServiceImpl.CreateTask |
| GET /tasks/:id | GetTaskById | GetById |
| POST /tasks/update/:id | UpdateTask | UpdateTask |
| DELETE /tasks/:id | DeleteTask | DeleteTask |
| GET /tasks/user/:user_id (?status&groupId&date) | GetTasksByUserID | GetTasksByUserID |
| POST /days/ | DayHandler.CreateDayHandler | DayServiceImpl.CreateDay |
| GET /days/:id | GetDayByIDHandler | GetDayByID |
| POST /days/update/:id | UpdateDayHandler | UpdateDay (rebuilds plan) |
| DELETE /days/:id | DeleteDayHandler | DeleteDay |
| GET /days/user/:user_id | GetDaysByUserIDHandler | GetDaysByUserID |
| POST /groups/ | GroupHandler.CreateGroup | GroupServiceImpl.CreateGroup |
| GET /groups/:id | GetGroupByID | GetGroupByID |
| POST /groups/update/:id | UpdateGroup | UpdateGroup |
| POST /groups/reorder | ReorderGroups | ReorderGroups |
| POST /groups/add/:id | AddTaskToGroup | AddTaskToGroup |
| DELETE /groups/:id | DeleteGroup | DeleteGroup |
| GET /groups/tasks/:id | GetAllGroupTasks | GetAllGroupTasks |
| GET /groups/user/:user_id | GetAllUserGroups | GetAllUserGroups |
| GET /push/key | PushHandler.GetPublicKey | PushServiceImpl.PublicKey |
| POST /push/subscribe | Subscribe | Subscribe |
| DELETE /push/subscribe | Unsubscribe | Unsubscribe |
| POST /push/test | SendTest | SendTest |
| GET/POST /notifications/settings/:user_id | NotificationHandler.GetSettings / UpdateSettings | NotificationServiceImpl.GetSettings / UpdateSettings |

Owner-checked variants `…ForUser(userID, id, …)` (`GetTaskForUser`, `UpdateTaskForUser`, `DeleteTaskForUser`, `GetGroupForUser`, `UpdateGroupForUser`, `DeleteGroupForUser`) have no REST route; they are for the future MCP and owner tests.

## cmd/

- `cmd/taskManager/main.go` - `main`/`run`: config, DB connect + migrate, wiring of repos -> services, gin on :8080, `api.RegisterTaskRoutes`, `api.RegisterFrontend(web.Dist())`, reminder scheduler goroutine, graceful shutdown.

## internal/api

- `routes.go` - `RegisterTaskRoutes` (the route table above; calls `handlers.UseJSONFieldNames`).
- `spa.go` - `RegisterFrontend`: serves embedded `web/dist`, SPA fallback to `index.html`, `/api/*` never falls back. Test: `spa_test.go`.
- `handlers/params.go` - `parseIDParam`: path id -> int64, answers 400 itself on failure.
- `handlers/errors.go` - `respondError` (status from service error kind, logs with error id), `respondBindingError`, `UseJSONFieldNames` (validator names fields like the client). Test: `errors_test.go`.
- `handlers/task_handlers.go`, `day_handlers.go`, `group_handler.go` - one handler struct per entity, thin: parse, bind, call service.
- `handlers/notification_handlers.go` - two handlers: `PushHandler` (push) and `NotificationHandler` (settings).

## internal/models (GORM models + request DTOs; see data.md)

- `task.go` - `Task`, `TaskCreateRequest`, `TaskUpdateRequest` (pointer fields = partial update), `TaskFilter`, `StatusActive/StatusCompleted`.
- `priority.go` - `Task.Recalculate(now)`: the only place Tl and priority are computed (`CalculatePriority` is its inner step, takes stored `HoursUntilDeadline`); `HoursUntilDeadline`, `MinHoursUntilDeadline`.
- `day.go` - `Day`, `DayTask` (join row with Minutes), `DayCreateRequest`, `DayUpdateRequest`, `StatusDayValid/Expired`, `Min/MaxDayMinutes`.
- `group.go` - `Group` (Tasks field is `gorm:"-"`), `Group*Request`, `GroupWeight`.
- `notification.go` - `PushSubscription` (+`PushSubscriptionResponse` without keys), `NotificationSettings` + defaults, `VapidKeys`, `NotificationLog`, push/settings request DTOs.

## internal/repository

- `database.go` - `Connect` (retries), `Migrate` = `runMigrations` then `MigrateGroupTasks` (wraps `ErrRepairFailed`).
- `migrations.go` - order: `renameColumns` (tasks columns, before AutoMigrate) -> `SetupJoinTable(Day.Tasks, DayTask)` -> `AutoMigrate` all models -> `MigrateGroupTasks` (old group_tasks -> tasks.group_id; `resolveGroupLinkConflicts`). All idempotent.
- `generic_repository.go` - `GenericRepository[T]`: `Create`, `FindByID` (not found = `nil, nil`) and other base CRUD.
- `task_database.go` - `TaskRepositoryImpl`: `FindByIDForUser`, `FindByUserID(filter)`, `UpdateFields`, `DeleteWithLinks`.
- `day_database.go` - `DayRepositoryImpl`: `FindByID`, `GetAllUserDays`, `CreateWithPlan`/`UpdateWithPlan` (transaction, slots via `insertSlots`), `DeleteWithSlots`, `FindByUserAndDateRange`.
- `group_database.go` - `GroupRepositoryImpl`: `FindByIDWithTasks`, `FindUserGroup`, `FindUserGroupsByIDs`, `GetAllUserGroups`, `ExistsByName`, `DeleteDetachingTasks`.
- `notification_database.go` - four repos: `PushSubscriptionRepositoryImpl` (Upsert, FindByEndpoint/UserID, FindUserIDs, DeleteByEndpoint), `NotificationSettingsRepositoryImpl` (FindByUserID(s), Update(apply fn)), `VapidKeysRepositoryImpl.GetOrCreate`, `NotificationLogRepositoryImpl.TryRecord` (dedup of reminders).

## internal/services

- `errors.go` - business errors: `newError(ErrKindNotFound|InvalidInput|Conflict, msg)`, `Error`, `NewInvalidInputError`.
- `task_services.go` - `TaskServiceImpl`: create/update/get/delete/list; recalculates priority on every formula change.
- `group_services.go` - `GroupServiceImpl`: CRUD, `ReorderGroups` (atomic weights), `AddTaskToGroup`; weight change recalculates the group's tasks.
- `day_services.go` - `DayServiceImpl`: create/update/get/delete days; `prepareDay`, `calculateDayPriority`.
- `day_plan.go` - pure `AllocateDayTime(total, candidates)`: splits day minutes between tasks by priority (`PlanCandidate`, `PlanSlot`).
- `notification_services.go` - `NotificationServiceImpl`: reminder settings get/update with validation.
- `push_services.go` - `PushServiceImpl`: VAPID key, subscribe/unsubscribe (endpoint host allow-list `PUSH_ENDPOINT_HOSTS`), `SendTest`, `SendToUser`; `PushConfig`.
- `push_sender.go` - `PushSender` interface, `WebPushSender` (webpush-go), `VapidCredentials`.
- `reminders.go` - pure reminder rules and texts: `dueDailyReminder`, `quietHoursEnd`, `selectDeadlineTasks`, `morning/evening/deadlineMessage`, `PushMessage`, `PushOptions`.
- `reminder_services.go` - `ReminderServiceImpl.Run(ctx)`: scheduler tick, applies rules, sends push, journals via `NotificationLog`.
- Tests: `*_test.go` here are unit tests (priority, day plan, reminders, push) plus DB integration tests (`integration_test.go`, `owner_integration_test.go`, `migration_test.go`, `tasks_query_test.go`) that skip without `TEST_DATABASE_URL`.

## other

- `internal/config/config.go` - `Config{DB, VAPID, ...}`, `Load` (cleanenv, env + optional YAML via `CONFIG_PATH`). Test beside it.
- `internal/testdb/testdb.go` - `Open(t)`: connects to `TEST_DATABASE_URL`, runs `repository.Migrate`, truncates tables; skips the test when unset.
- `internal/lib/logger/slog/slog.go` - `InitLogger`, `Err(err)` attr.
- `internal/lib/logger/handlers/slogdiscard/slogdiscard.go` - `NewDiscardLogger` for tests.
- `web/embed.go` (package `web`) - `Dist()` returns embedded `web/dist`.
