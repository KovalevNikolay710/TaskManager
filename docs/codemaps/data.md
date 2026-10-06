# Data codemap

Generated 2026-10-06 after stage 3; update when a merge changes structure.

Models live in `internal/models/`; all are registered in `repository.runMigrations` (`internal/repository/migrations.go`). Response JSON uses explicit PascalCase tags (field name = wire name); request DTOs use camelCase tags (`userId`, `timeForExecution`, ...). `json:"-"` fields never leave the server.

## Tables

**tasks** (`Task`): `TaskId` pk; `UserId`; `GroupId` (0 = no group, indexed; the only task-group link); `GroupPriority` (copy of group weight 1-10, default 1); `Deadline`; `TimeForExecution` (minutes, >= 1); `Priority` (float, derived); `HoursUntilDeadline` (derived, >= 1); `PercentOfCompleting` (0-100); `Status`; `Name`; `Description`; `CreatedAt`/`UpdatedAt`.
Derived fields are written only through `Task.Recalculate(now)` (`models/priority.go`). Index `idx_tasks_user_status (user_id, status)`.

**groups** (`Group`): `GroupId` pk; `UserId` (indexed); `GroupPriority` (weight 1-10); `Name` (unique per user, checked in service via `ExistsByName`); `Description`; timestamps. `Group.Tasks` is `gorm:"-"`: filled by the repository from `tasks.group_id`, not a relation.

**days** (`Day`): `DayId` pk; `UserId`, `Date` (index `idx_days_user_date (user_id, date)`); `TimeForTasks` (minutes, 15-960); `AmountOfTasks` (len(Slots), frontend ignores); `PriorityOfTheDay` (sum of Priority of unfinished plan tasks); `Status`; `UpdatedAt`. Fields `Tasks []*Task` (many2many) and `Slots []DayTask` both map to `day_tasks`.

**day_tasks** (`DayTask`): composite pk `day_day_id`, `task_task_id` (names kept from the old GORM many2many so old plans survive); `Minutes` = time allocated to the task that day. FK cascade on delete of day.

**push_subscriptions** (`PushSubscription`): `SubscriptionId` pk, `UserId` (index), `Endpoint` (unique), `P256dh`/`Auth` (json `-`), `UserAgent`, timestamps.
**notification_settings** (`NotificationSettings`): pk `UserId` (one row per user); `Morning/Evening/Deadline/QuietEnabled`, `MorningTime`/`EveningTime`/`QuietFrom`/`QuietTo` ("HH:MM" strings), `DeadlineHoursBefore` (1-24). Defaults in `models.DefaultNotificationSettings` / `Default*` consts.
**vapid_keys** (`VapidKeys`): single row `Id = 1`; `PublicKey` (base64url), `PrivateKey` (json `-`).
**notification_log** (`NotificationLog`, custom `TableName`): reminder dedup journal; unique index `(user_id, kind, task_id, key)`; kinds `morning|evening|deadline`; `key` = local date for morning/evening, deadline RFC3339 UTC for deadline.

## Enums

- `Task.Status`: `StatusActive = 1`, `StatusCompleted = 2`. Invariant: `Status = 2` <=> `PercentOfCompleting = 100`. Update DTO accepts 1 or 2.
- `Day.Status`: `StatusDayValid = 0`, `StatusDayExpired = 1`.
- Group weight 1-10; `GroupId = 0` no group.

## Wire names quick map

Task response: `TaskId, UserId, GroupId, GroupPriority, Deadline, TimeForExecution, Priority, HoursUntilDeadline, PercentOfCompleting, Status, Name, Description, CreatedAt, UpdatedAt`. Day response adds `Tasks[]` and `Slots[] {DayId, TaskId, Minutes}`. Mirrored in `web/src/api/types.ts`. Details of quirks: `api-reference` skill.

## Migration history

- Old `dead_line`, `number_of_hours_until_dl`, `group_priorty` columns renamed to `deadline`, `hours_until_deadline`, `group_priority` by `renameColumns` (before AutoMigrate).
- Old `group_tasks` join table dropped as a relation; `MigrateGroupTasks` copies membership into `tasks.group_id` (one group per task, conflicts resolved in `resolveGroupLinkConflicts`, logged).
- `day_tasks` gained `minutes` via `SetupJoinTable(Day.Tasks, DayTask)`.
- Order in `repository.Migrate`: renameColumns -> SetupJoinTable -> AutoMigrate -> MigrateGroupTasks. No versioned migration files: everything is idempotent code run at every start.
- `internal/testdb` calls the same `repository.Migrate`.
