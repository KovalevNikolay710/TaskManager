# Group weight scale ×1…×10
Group weight (`Group.GroupPriority`, multiplier `Pg`) has 10 steps, each with its own colour: calm blue-grey (×1) through teal and green to amber, red and magenta (×10). Warmer and more saturated = more important.

| Token | Use | Contrast |
|---|---|---|
| `--color-weight-N` | graphics: ladder step, day-chart sector, chip dot, task bar in day plan, badge border | >= 3:1 on `--color-surface` in both themes. Not used on `--color-bg` (×7 has 3.2:1 there -> use a border) |
| `--color-weight-N-soft` | bg of badge, tile, selected chip, group card on the ladder | — |
| `--color-weight-N-text` | "×N" and text on `-soft` | >= 5.8:1 on `-soft`, >= 6.6:1 on surface |

- Markup uses utility `.w-N`: it sets `--w`, `--w-soft`, `--w-text`; components read only these three. Frontend: `weightClass(n)` clamps `n` to 1–10 (legacy groups may exceed 10 — shown as ×10).
- No text on solid `--color-weight-N` (×9–×10 fail AA for both white and dark text in both themes).
- "×N" always accompanies the colour.
- "Без группы" = weight 1 but shown neutral (`--color-border-strong`) in GroupPicker and on the ladder to differ from a real ×1 group.
- Not the task **priority** scale (`--color-priority-low|mid|high`, relative, three levels): weight is a user-set group property; priority is the formula result. On a task the weight scale appears only on the day screen.
