# PriorityIndicator
Compact task priority, two elements:
1. **Bar** at the left of the task card: width `--size-priority-bar`, full card height, colour by level.
2. **Chip with number** (also called `PriorityChip`) right in the meta row: `--text-xs` medium, `font-variant-numeric: tabular-nums`, padding `2px 6px`, `--radius-sm`, bg `--color-priority-<level>-soft`, text `--color-priority-<level>-text`; small zap icon or 6px dot of level colour before the number. `aria-label="Приоритет 7,5, высокий"`.

Levels are computed on the client relative to max `Priority` among **active** tasks of the current set (screen/day) — absolute thresholds would be arbitrary because `Pt` has no fixed scale:

| Level | Condition | Tokens |
|---|---|---|
| high | `Priority >= 0.6 * max` | `--color-priority-high*` |
| mid | `0.25 * max <= Priority < 0.6 * max` | `--color-priority-mid*` |
| low | `Priority < 0.25 * max` or `max = 0` | `--color-priority-low*` |

- Number: `Priority` rounded to 1 decimal, comma separator ("7,5"); if `0 < Priority < 0.1` — "<0,1".
- Completed tasks: neutral — bar `--color-border`, chip hidden.
- Not the group weight scale: see [weight-scale](../foundations/weight-scale.md).
