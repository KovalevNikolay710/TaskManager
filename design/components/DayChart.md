# DayChart
Donut chart of the day plan (day screen): what share of the day each task takes.
- Card: bg `--color-surface`, `--radius-lg`, `--shadow-sm`, padding `--space-4` (desktop `--space-6`). Mobile: ring centred, summary below. Desktop (>= 960px): ring left, summary right, note (`day-chart__note`) full width at the bottom.
- **Ring** (SVG `viewBox 0 0 240 240`, outer r 112, inner r 74): diameter `--size-day-chart` (220px; desktop 240px). Track `--color-day-free`. 100% of the ring = `Day.TimeForTasks`.
- **Sector** = task slot: angle `Minutes / TimeForTasks * 360deg`, from 12 o'clock clockwise in list order (active by `Priority` desc, then completed, then "Свободно"). Fill `--w` by the task's group weight; completed `--color-day-done`; "Свободно" `--color-day-free` (merges with the track). 2px `--color-surface` stroke between sectors. No labels on the ring.
- **Centre** (`aria-live="polite"`): default "4:30" (`--text-2xl` semibold) + "осталось из 6:00" (`--text-xs` muted). When a sector is highlighted: task name (`--text-sm` medium, 2 lines), its time "1:25" (`--text-xl`), caption "сегодня · Учёба" / "выполнено" / "свободно".
- **Highlight**: hover on sector or row, focus on row, tap on sector (pins; second tap or tap outside releases). Other sectors opacity 0.3, selected `scale(1.04)` (no scale under `prefers-reduced-motion`); list side: see [TaskRow](TaskRow.md) "day slot".
- **Summary** (`day-chart__summary`, `--text-sm`): rows with 12px colour square and value right (semibold, tabular-nums): "В работе: 6 задач — 4:30" (square = mini cone of scale colours), "Выполнено: 1 — 1:30" (`--color-day-done`), "Свободно — 2:55" (`--color-day-free` with border), "⚡ Приоритет дня (осталось) — 26,9" (muted). Zero rows are hidden except "В работе".
- **Note** (`day-chart__note`, divider above): "Ещё N задач не в плане…" + ghost "Изменить план", or "Всё, что нужно сегодня, помещается. Свободные 2:55 — на новое дело или отдых".
- a11y: `<svg role="img" aria-label="План на 6:00: <задача> 1 час 25 минут; …; свободно 2 часа 55 минут">`; sectors are not focusable — the task list is the text equivalent.
- Skeleton: circle `--size-day-chart` + two bars.
- Many small sectors: min slot 15 min (5.6deg at 16:00, 30deg at 3:00), always separated by the 2px gap. Neighbouring tasks of one group share a colour (colour = weight, not task).
