# PercentSlider
Task progress (`PercentOfCompleting`).
- Row: label "Выполнено" (`form-card__title`) left, value right "40%" (`--text-xl` semibold, tabular-nums, `<output>`).
- `input type="range"` 0–100, step 5, 44px zone; track 8px `--radius-full`: filled `--color-accent`, rest `--color-surface-sunken`; thumb 24px, bg `--color-surface`, 2px `--color-accent` border, `--shadow-md`; focus adds 6px ring `--color-accent-soft`. Fill via CSS variable `--value`.
- Under the track steps "0% · 25% · 50% · 75% · 100%" (buttons `step`, `--text-xs` muted, 44px zone; the matching one `--color-accent` semibold, `aria-pressed`).
- Hint "На 100% задача станет выполненной" (on the task screen: "При сохранении задача станет выполненной"). Keyboard: arrows +-5, PageUp/PageDown +-25, Home/End.
- Disabled (task completed): opacity 0.5, hint "Чтобы изменить прогресс, верните задачу в работу".
