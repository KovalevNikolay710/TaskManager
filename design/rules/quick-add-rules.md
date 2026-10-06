# Quick add: defaults, draft, hand-off
Source of truth for `web/src/lib/taskForm.ts` (`defaultDeadlinePreset`), `web/src/lib/quickAdd.ts`. Screen summary: [quick-add](../screens/quick-add.md).

## Default deadline: contract
On open exactly one deadline chip is selected: the one returned by `defaultDeadlinePreset(now: Date, presets: DeadlinePreset[]): DeadlinePreset`. It returns an element of `presets` (= `deadlinePresets(now)`), never "Другое…". The rule itself is the user's own (learning task); the sheet does not depend on it. Stub if absent: "Завтра, 18:00". Tests for the rule are written with the function.
- Called on every open; nothing remembered between openings. Within one series the last chosen chip stays.
- If the selected chip disappears while open (e.g. "Сегодня, 21:00" after 20:00), pick `defaultDeadlinePreset(now, presets)` for the new list. Chips recompute every minute (`useNow`).
- Designer's recommendation (not required): 00:00–04:59 -> "Сегодня, 21:00"; otherwise "Завтра, 18:00". Not "today" by default: with `Tl` of 20–40 h a quick task lands mid-list; "today" would put every quick task on top and break priority sorting.
- `DeadlinePreset` should have `id: 'today' | 'tomorrow' | 'in3days' | 'inWeek'`; labels and dates unchanged (used by `DeadlineField` and tests).

## Defaults and chips
- Deadline chips: "Сегодня, 21:00" (only before 20:00), "Завтра, 18:00", "Через 3 дня", "Через неделю", "Другое…"; full date in `title` ("чт, 8 октября, 18:00").
- Time chips `QUICK_TIME_PRESETS = [15, 30, 60, 120]`: "15 мин", "30 мин", "1:00", "2:00", "Другое…" (`aria-label`: "15 минут", "30 минут", "1 час", "2 часа"). Default **30 min**.
- Group default: `localStorage` `tm.lastGroupId` if the group still exists, else "Без группы" (`groupId = 0`).

## Draft
- Key `tm.quickAddDraft`: `{ name, deadline: { presetId } | { date, time }, minutes, groupId, savedAt }`. Written on input (debounce 300 ms) and on close if name is non-empty.
- On open, if younger than 24 h: restore name and choices. `presetId` -> date via `deadlinePresets(now)`; if the chip no longer exists use `defaultDeadlinePreset`. A custom `date`+`time` is restored only if still valid (>= now + 1 h), else default.
- Deleted after successful create and on "Подробнее".
- Closing never asks for confirmation: text goes to the draft.

## "Подробнее" -> `/tasks/new?...`
| Param | Example | Meaning |
|---|---|---|
| `name` | `name=Повторить%20билеты` | trimmed; empty is not passed |
| `date` | `date=2026-10-06` | `YYYY-MM-DD` |
| `time` | `time=18:00` | `HH:MM` |
| `te` | `te=30` | minutes |
| `groupId` | `groupId=3` | `0` = no group |

`NewTaskPage`: each param validated separately, invalid ignored; `te` shown via `formatDuration`; unknown `groupId` -> "Без группы"; with `name` focus goes to "Описание", else "Название"; prefilled form counts as dirty ("Выйти без сохранения?").
