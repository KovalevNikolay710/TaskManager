# TaskRow (task card)
Main list element. Layout: `[bar] [Checkbox] name / meta row ... [priority chip]`.
- Container: bg `--color-surface`, padding `--space-3 --space-4`, [PriorityIndicator](PriorityIndicator.md) bar at left.
- Two placements: inside [GroupSection](GroupSection.md) — rows of a shared card with dividers; standalone list (`.task-list` > `.task-card`) — separate cards `--radius-md`, `--shadow-sm`, gap `--space-2`.
- Column 1: [Checkbox](Checkbox.md). Column 2:
  - name: `--text-md` medium, `--color-text`, max 2 lines then ellipsis;
  - meta row `--text-sm` `--color-text-muted`, items separated by " · ": time to execute (`TimeForExecution`, clock icon + `Ч:ММ`, `aria-label="2 часа 30 минут"`); deadline ([DeadlineLabel](DeadlineLabel.md)); progress (`PercentOfCompleting`, only if 0 < % < 100: "40%"); on screens mixing groups in one list (day) the group name with folder icon goes first;
  - at the right of the meta row (pushed right): priority chip. If the meta row does not fit, facts wrap to a second line, chip stays right.
- Tap on the card (outside checkbox) opens `/tasks/:TaskId`. Desktop hover: bg `--color-surface-sunken`.
- **Completed**: name `--color-text-muted` + line-through, meta row hidden except deadline, card opacity 0.7, neutral bar. Goes to the bottom of its group.
- **Search match**: matched fragment in `<mark>` with bg `--color-accent-soft`, text colour inherited.
- **Variant "day slot"** (`task--slot` + `.w-N`, day screen only):
  - left bar = colour of the [DayChart](DayChart.md) sector (`--w` by `Task.GroupPriorty`), not priority level: the row is the chart legend. Completed: `--color-day-done`. Priority is still conveyed by order and chip;
  - right of the name (`task__top`): allotted time `SlotTime` **"1:25"** (`--text-md` semibold, tabular-nums) + "сегодня" (`--text-xs` muted); screen reader: "В плане на сегодня: 1 час 25 минут". Completed: time stays, muted;
  - in the meta row the execution time is labelled "всего 3:00" so it is not confused with "сегодня";
  - highlight from chart: list gets `task-list--focus` (other cards opacity 0.45), selected card `task-card--active` (2px border `--w`, `--shadow-md`).
