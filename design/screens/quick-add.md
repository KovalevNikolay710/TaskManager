# Быстрая задача (QuickAddSheet)
Mockup `quick-add.html` holds exact copy for all states (panel and keyboard block are mockup-only). Code is the source of truth. **Purpose:** add a task in one action (**Fab -> name -> Enter**); series-friendly. A bottom sheet over all-tasks/day, not a route; full form via "Подробнее".

Anatomy/behaviour: [QuickAddSheet](../components/QuickAddSheet.md), [ChipRow](../components/ChipRow.md), [GroupToggle](../components/GroupToggle.md), [Notice](../components/Notice.md). Defaults, `defaultDeadlinePreset` contract, draft, "Подробнее" params: [quick-add-rules](../rules/quick-add-rules.md).

## Open / close
Opened by Fab, desktop "Новая задача", key `N`, EmptyState buttons, or `?quick=1` on `/all-tasks` / `/day` (PWA shortcut). Opening pushes `?quick=1`; Back, x, backdrop, swipe down (>80px), Esc call `history.back()`; shortcut-opened closes via `replace`. Focus returns to the opener. Closing with text never asks (draft).

## Data
Shared caches: `GET /api/groups/user/:id` (fetch on open if absent), `GET /api/tasks/user/:id` (only "встанет N-й из M"). Preview per [PriorityCard](../components/PriorityCard.md), level vs `max(active Priority, Pt)`.

## Actions
- Enter (not `isComposing`) / "Добавить": `POST /api/tasks/` `{"userId", "name", "description": "", "deadline" RFC3339, "timeForExecution", "percentOfCompleting": 0, "groupId"}`.
- After 201: add to `tasks` (not `days`), `writeLastGroupId`, delete draft; place = `1 + count(active with Priority > Task.Priority)` of active incl. new; success line "**5-я из 12** — «…»" + "Открыть". Chosen group but `Task.GroupId = 0`: "… — создана без группы: группа не найдена", refresh groups.
- "Подробнее": `navigate('/tasks/new?' + params)`, no animation, draft deleted.
- After close with N >= 1 created: all-tasks N=1 Toast "Задача создана" + "Открыть", N>1 "Добавлено 3 задачи" + "Показать" (scroll to first new, highlight); day: same texts + "В план" (only if a plan exists for the selected today/future date). N=0: none.

## States
Empty, filled, "Другое…" deadline (as DeadlineField) / time (0:05–99:59), group row open, groups loading (send `tm.lastGroupId`) / error (toggle "Без группы", sends `0`), sending (name `readOnly`, "Добавляем…"), success (stays open, name cleared, choices kept, new card highlighted 1.5 s), offline (Notice, "Добавить" disabled, nothing queued), server error (Alert, no focus grab; 400/500 with "дедлайн"/"дата" -> error on the deadline row "Срок уже слишком близко — выберите другой").

## Responsive
Mobile: rows scroll horizontally. >= 960px: 520px dialog, top-pinned, chips wrap, `kbd` hint.

## Open questions
Offline queue (IndexedDB + Background Sync) and remembering the last deadline between openings are deferred.
