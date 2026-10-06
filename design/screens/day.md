# Задачи на день
Mockup `day.html` holds the copy for all states. Code is the source of truth. **Purpose:** user states today's time; the app splits it among all active tasks by `Pt` and pace; a donut shows shares. Start screen. **Route:** `/day[?date=YYYY-MM-DD]`.

**Allocation algorithm "Темп + остаток", rebuild and fixed-plan rules: [day-allocation](../rules/day-allocation.md)**.

## Data
1. `GET /api/days/user/:id` -> `Day[]` with `Tasks`, `Slots` (`TaskId`, `Minutes`), `Date`, `TimeForTasks`. Day = local `Date` match (several: max `DayId`).
2. `GET /api/groups/user/:id` -> labels (failure hides them).
3. `POST /api/tasks/user/:id` `{}` -> "Ещё N задач не в плане": active, `DeadLine` after day start, not in `Slots`; today/future only.

## Rules
- Order of list and sectors: active by `Priority` desc, completed by `Minutes` desc, then "Свободно".
- Free = `TimeForTasks - sum(Minutes)`, shown if >= 5 min. Centre "осталось" = sum of active `Minutes`. "Приоритет дня (осталось)" = sum of `Priority` of `Status = 1` (client).
- Sector colour: `Task.GroupPriorty` clamped 1–10 (no group 1). Priority level vs max over this day's active tasks.
- Past day: Badge "Прошедший день", no plan editing.
- Refetch `days` on `visibilitychange`; group weight change invalidates `days`.

## Actions
- Check `POST /api/tasks/update/:id` `{"percentOfCompleting": 100}` — sector turns grey **in place**, no redistribution; uncheck `{"status": 1}`; `Minutes` never change.
- "Составить план" `POST /api/days/` `{"date": <selected day 00:00 local RFC3339>, "userId", "timeForTasks"}` (no `amountOfTasks`) -> 201.
- "Изменить план" -> Sheet with PlanForm (min `max(0:15, completed minutes)`, max 16:00). "Пересобрать" `POST /api/days/update/:id` `{"timeForTasks"}`.
- Fab / "Новая задача" -> QuickAddSheet; after close Toast with "В план" (opens plan Sheet if a plan exists). Date arrows -> neighbouring `Day`. Tap task -> `/tasks/:TaskId`.

## Components
[AppHeader](../components/AppHeader.md), [DateSwitcher](../components/DateSwitcher.md), [DayChart](../components/DayChart.md), [SectionTitle](../components/SectionTitle.md), [TaskRow](../components/TaskRow.md) (day slot), [PlanForm](../components/PlanForm.md), [Sheet](../components/Sheet.md), [Alert](../components/Alert.md), [Badge](../components/Badge.md), [Fab](../components/Fab.md), [EmptyState](../components/EmptyState.md), [ErrorState](../components/ErrorState.md), [Toast](../components/Toast.md).

## States
Loading; data; free time; not all in plan (note + "Изменить план"); no plan (PlanForm, default last `TimeForTasks` or 6:00; past date: none); empty plan (`Day` without `Slots`); old plan (all `Minutes = 0`: no ring, info Alert + "Пересобрать"); all done; error; check error; saving.

## Responsive
Ring 220px, summary below; >= 960px: ring 240px beside the summary.
