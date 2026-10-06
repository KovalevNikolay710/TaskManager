# Задача
Mockup `task.html` holds exact copy for all states. Code is the source of truth. **Purpose:** edit one task, complete/return, delete, understand priority. **Route:** `/tasks/:taskId`.

## Data
- `GET /api/tasks/:id` -> `Task` (404 = not found; non-numeric id -> 400, shown as not found). Render from cache (`tasks` / `Day.Tasks`) at once, refresh in background.
- `GET /api/groups/user/:id` (picker, group name); `GET /api/tasks/user/:id` (queue place only; failure hides it).
- Fields: `Name`, `Status`, `UpdatedAt` (no `CompletedAt`: "Отмечена …" uses it), `Priority`, `GroupPriority`/`TimeForExecution`/`HoursUntilDeadline`/`PercentOfCompleting` (server values for the breakdown), `Deadline`, `GroupId`, `Description`, `CreatedAt`.
- Place = position in `sortTasks` among active; level relative to max over all active; hidden when done.

## Rules
- Always-editable form; any difference from the server version = changed -> ActionBar "Отменить"/"Сохранить", PriorityCard forecast; leaving asks ConfirmSheet "Выйти без сохранения?".
- Save `POST /api/tasks/update/:id` with **only changed** fields (`name`, `description`, `deadline` RFC3339, `timeForExecution`, `percentOfCompleting`, `groupId`; 0 = no group); Ctrl+Enter. On success replace the task in `tasks` and all `Day.Tasks`, reset form, Toast "Сохранено". 100% -> `Status = 2`.
- "Отметить выполненной" `{"status": 2}` / "Вернуть в работу" `{"status": 1}` (server resets 100 -> 0) send immediately, with changed fields in the same request.
- Delete: ConfirmSheet "Удалить задачу?" ("„<Name>“ удалится вместе с прогрессом и пропадёт из плана на день…") -> `DELETE /api/tasks/:id`; purge caches, back, Toast "Задача удалена".
- Validation: [task-form](../rules/task-form.md); no presets on this screen.
- Refetch on `visibilitychange` only if unchanged.

## Components
[PageHeader](../components/PageHeader.md), [TitleInput](../components/TitleInput.md), [StatusBanner](../components/StatusBanner.md), [PriorityCard](../components/PriorityCard.md), [FormCard](../components/FormCard.md), [PercentSlider](../components/PercentSlider.md), [DeadlineField](../components/DeadlineField.md), [TimeInput](../components/TimeInput.md), [GroupPicker](../components/GroupPicker.md), [GroupForm](../components/GroupForm.md), [MetaNote](../components/MetaNote.md), [ActionBar](../components/ActionBar.md), [ConfirmSheet](../components/ConfirmSheet.md), [Alert](../components/Alert.md), [Toast](../components/Toast.md).

## States
Loading (no cache), not found, load error (with cache: show cache + Toast), changed, saving, save error (edits stay, Toast "Не удалось сохранить изменения" + "Повторить"), completed, status change pending.

## Responsive
No BottomNav on mobile; >= 960px SideNav ("Все задачи"), column 720px.
