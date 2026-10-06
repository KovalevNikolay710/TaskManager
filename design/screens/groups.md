# Группы
Mockup `groups.html` holds exact copy for all states. Code is the source of truth. **Purpose:** set group weights ×1…×10 on a ladder (several groups per step; insert between two occupied steps and others shift). **Route:** `/groups` (BottomNav keeps "Все задачи" active).

Ladder UI, drag and placement mode: [GroupLadder](../components/GroupLadder.md). Insertion algorithm: [ladder-insert](../rules/ladder-insert.md).

## Data
- `GET /api/groups/user/:id` -> `Group[]` (`GroupId`, `Name`, `GroupPriority`).
- `POST /api/tasks/user/:id` `{}` -> counters (`GroupId`, `Status = 2` = done); on failure from `Group.Tasks`, "Без группы" without counter. "Без группы" = `GroupId = 0` or unknown group.

## Rules
- Move to step N: `POST /api/groups/update/:GroupId` `{"groupPriority": N}`. Insert between steps: client computes weights, one request for **all changed groups**: `POST /api/groups/reorder` `{"userId", "groups": [{"groupId", "groupPriority"}]}` -> full `Group[]` replaces the cache. Both invalidate `tasks` and `days`. Optimistic (`--pending`), rollback on error.
- Toast 6 s: "„Спорт“ теперь ×3. Поднялись: Учёба ×4, Английский ×5" + "Отменить" (reorder back with old weights -> "Перенос отменён"); error "Не удалось переставить группы" + "Повторить".
- Group card -> Sheet [GroupForm](../components/GroupForm.md) (`POST /api/groups/update/:id`, only changed fields). Create: `POST /api/groups/` `{"userId", "name", "groupPriority"}` -> 201, step highlighted 2 s, Toast "Группа создана". No ladder in the Sheet (does not fit): [WeightScale](../components/WeightScale.md) shows occupied steps.
- Delete (danger-ghost in Sheet): ConfirmSheet "Удалить группу „Учёба“?" — tasks move to "Без группы" with weight ×1 (priority drops by the old weight), other groups stay; `DELETE /api/groups/:id`.
- No Fab. Intro and caption texts: see mockup.

## Components
[PageHeader](../components/PageHeader.md) (ghost "+ Новая группа"; icon-only < 360px), [GroupLadder](../components/GroupLadder.md), [PlaceBanner](../components/PlaceBanner.md), [WeightScale](../components/WeightScale.md), [GroupForm](../components/GroupForm.md), [Sheet](../components/Sheet.md), [ConfirmSheet](../components/ConfirmSheet.md), [Toast](../components/Toast.md), [Skeleton](../components/Skeleton.md), [EmptyState](../components/EmptyState.md) (0 groups, header button hidden), [ErrorState](../components/ErrorState.md).

## States
Loading, data, empty, error, dragging, placing, saving, after move, move error, Sheets (edit / new / delete).

## Responsive
Handrail 76px mobile, 112px >= 960px (hover, `grab`, Sheet 420px dialog).
