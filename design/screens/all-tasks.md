# Все задачи
Mockup `all-tasks.html` holds exact copy for all states (switcher panel is mockup-only). Code is the source of truth. **Purpose:** full task list by group; mark done; search. **Route:** `/all-tasks`.

## Data (`userId` = `CURRENT_USER_ID`, PascalCase responses)
- `GET /api/groups/user/:id` -> `Group[]` (`GroupId`, `Name`, `GroupPriority`).
- `GET /api/tasks/user/:id` -> `Task[]` (`Name`, `Description`, `Deadline`, `TimeForExecution`, `PercentOfCompleting`, `Priority`, `Status`, `GroupId`, `UpdatedAt`). Never pass `status` in the query.

## Rules
- Sections by `GroupPriority` desc, then name; "Без группы" last (`GroupId = 0` or unknown group); empty groups hidden.
- In a group: active by `Priority` desc, then completed by `UpdatedAt` desc. Priority level is relative to max over **all** active tasks on the screen.
- Subtitle "9 активных · 2 выполнено"; counter "1 / 4".
- Search: client-side on `Name` + `Description`, case and "ё/е" insensitive, debounce 150 ms; groups without matches hidden, all expanded.
- Collapsed groups in `localStorage` `tm.collapsedGroups`. Refetch on `visibilitychange` / return from other screens.

## Actions
- Check: `POST /api/tasks/update/:id` `{"percentOfCompleting": 100}`; uncheck `{"status": 1}`. Replace card with the response; error -> rollback + Toast "Не удалось отметить задачу" + "Повторить".
- Tap card -> `/tasks/:TaskId`; Fab / "Новая задача" / `N` -> QuickAddSheet; "Группы" -> `/groups`; avatar -> `/profile`.

## Components
[AppHeader](../components/AppHeader.md), [AvatarButton](../components/AvatarButton.md), [SearchField](../components/SearchField.md), [GroupSection](../components/GroupSection.md), [TaskRow](../components/TaskRow.md), [Fab](../components/Fab.md), [BottomNav](../components/BottomNav.md), [Skeleton](../components/Skeleton.md), [EmptyState](../components/EmptyState.md), [ErrorState](../components/ErrorState.md), [Toast](../components/Toast.md).

## States
Loading (search + 2 groups skeleton); empty (0 tasks, search hidden, "Добавить задачу" opens quick add); error (retry both requests); search empty ("Сбросить поиск"); check pending/error.

## Responsive
>= 960px: SideNav, primary "Новая задача" in header, no Fab/BottomNav, column 720px.
