# GroupPicker
Task group choice — single-select chips.
- Container `role="radiogroup"`, chips `role="radio"` + `aria-checked` (selected look as `aria-pressed` on [Chip](Chip.md)). Arrows left/right switch (roving tabindex).
- Order: user's groups by `GroupPriority` desc then `Name`; then "Без группы" (`groupId = 0`); last the action chip "+ Новая группа" (`chip--add`, not a radio).
- Group chip (`chip chip--weight w-N`): 8px dot of weight colour (`chip__dot`, `--w`), name, weight "×3" (`chip__weight`, `--text-xs` muted). Selected chip uses its own step colours: bg `--w-soft`, 1.5px border `--w`, text `--w-text`. `aria-label="Учёба, вес 3"`. "Без группы": dot `--color-border-strong`.
- Long names cut with ellipsis at 24 chars (full name in `title`).
- "+ Новая группа" opens a [Sheet](Sheet.md) with [GroupForm](GroupForm.md); after creation the new group appears and is selected, focus on it.
- Loading: 3 `chip--skeleton` + "Без группы" (available at once). Load error: hint "Не удалось загрузить группы" + ghost "Повторить"; "Без группы" and "+ Новая группа" stay available.
- Below the chips: hint "Цвет и ×N — вес группы: он умножает приоритет задачи." + link "Управлять группами" (-> `/groups`).
- In QuickAddSheet used as a [ChipRow](ChipRow.md) without "+ Новая группа" and without the hint.
