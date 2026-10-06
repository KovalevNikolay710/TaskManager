# WeightScale
Group weight 1–10 picker in [GroupForm](GroupForm.md) — a "mini ladder". Colours: [weight-scale](../foundations/weight-scale.md).
- Header: field label left, value "×4" right in a step-coloured plate (`weight-scale__value`: bg `--w-soft`, 1.5px border `--w`, text `--w-text`, `--text-lg` semibold).
- Track (`weight-scale__track`, height 72px): 10 bars across the full width, height grows with number (8px + N*4.4px), each `--color-weight-N`. Bars <= selected: full colour; above: opacity 0.28. Selected: double ring (2px bg + 2px `--w`). Numbers 1…10 under bars (`--text-xs` muted; selected `--w-text` semibold).
- 6px `--color-text-muted` dots above bars = steps occupied by other groups; legend under the track "● уже заняты: ×4 Английский · ×2 Работа, Хобби · ×1 Дом, Спорт".
- Interaction: the whole track is one touch target (one slider instead of 10 buttons, which would be ~30px on 360px). Tap/drag selects the bar under the pointer (`floor(x / width * 10) + 1`). Keyboard: left/down -1, right/up +1, Home ×1, End ×10.
- a11y: track `role="slider"`, `tabindex="0"`, `aria-valuemin=1`, `aria-valuemax=10`, `aria-valuenow`, `aria-valuetext="×4, на одной ступени с Английский"`, `aria-labelledby` = label, `aria-describedby` = hint. Focus: 2px `--color-focus` outline with 4px offset.
