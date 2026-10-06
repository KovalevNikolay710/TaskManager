# GroupToggle
Compact current-group display in [QuickAddSheet](QuickAddSheet.md): a chip-button that expands a [ChipRow](ChipRow.md) with [GroupPicker](GroupPicker.md).
- Look: `chip` in the selected group's step colours (bg `--w-soft`, 1.5px border `--w`, text `--w-text`); "Без группы": bg `--color-surface-sunken`, border `--color-border-strong`. Inside: 8px dot, name (ellipsis, max-width 62% of the row), "×3", 16px chevron that rotates on expand.
- `aria-expanded`, `aria-controls` = groups row; `aria-label="Группа: Учёба, вес 3. Сменить"`.
- Loading groups: `chip--skeleton` 96px wide.
