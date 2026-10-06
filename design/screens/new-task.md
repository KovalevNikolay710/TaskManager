# Новая задача
Mockup `new-task.html` holds exact copy for all states. Code is the source of truth. **Purpose:** create a task with all fields; see queue place before saving. **Route:** `/tasks/new` (from "Подробнее" in QuickAddSheet; query params: [quick-add-rules](../rules/quick-add-rules.md)).

## Data
- `GET /api/groups/user/:id` -> `Group[]` (`GroupId`, `Name`, `GroupPriority`); `GET /api/tasks/user/:id` -> `Task[]` (`Priority`, `Status`) for queue place (failure -> number only).
- Default group: `localStorage` `tm.lastGroupId` if it exists, else "Без группы".

## Rules
- Preview and queue place: [PriorityCard](../components/PriorityCard.md). Validation, warning, server errors: [task-form](../rules/task-form.md). No progress field.
- Create `POST /api/tasks/` `{"userId", "name", "description", "deadline" (RFC3339, local offset), "timeForExecution", "percentOfCompleting": 0, "groupId"}`; Ctrl/Cmd+Enter; repeated submits ignored.
- After 201: add to `tasks` (not `days`), `tm.lastGroupId = Task.GroupId`, back (no history -> `/all-tasks`); all-tasks expands the group, scrolls to and highlights the card (1.5 s); Toast "Задача создана" + "Открыть". If a group was chosen but `Task.GroupId = 0`: Toast "Задача создана без группы: группа не найдена" and refresh groups.
- "+ Новая группа": Sheet + [GroupForm](../components/GroupForm.md); `POST /api/groups/` `{"userId", "name", "groupPriority"}`; new group is selected; name uniqueness checked on the client.
- Cancel/back/Esc: empty -> `history.back()`; dirty -> ConfirmSheet "Выйти без сохранения?" / "Введённые данные пропадут."; `beforeunload`. "Управлять группами" asks the same.

## Components
[PageHeader](../components/PageHeader.md), [FormCard](../components/FormCard.md) ("Что сделать", "Срок и объём" with time presets 0:30/1:00/2:00/4:00, "Группа"), [Field](../components/Field.md), [DeadlineField](../components/DeadlineField.md), [TimeInput](../components/TimeInput.md), [GroupPicker](../components/GroupPicker.md), [PriorityCard](../components/PriorityCard.md), [ActionBar](../components/ActionBar.md), [Alert](../components/Alert.md), [ConfirmSheet](../components/ConfirmSheet.md), [Toast](../components/Toast.md).

## States
Empty (name focused), filled, validation errors (focus first invalid), warning, sending ("Создаём…"), server error (Alert takes focus, data kept), groups loading/error.

## Responsive
No BottomNav on mobile (ActionBar fixed); >= 960px SideNav ("Все задачи"), column 720px, sticky ActionBar.
