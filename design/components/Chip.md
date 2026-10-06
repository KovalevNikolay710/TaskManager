# Chip
Pill button for presets and single-choice rows (see [PlanForm](PlanForm.md), [DeadlineField](DeadlineField.md), [GroupPicker](GroupPicker.md), [ChipRow](ChipRow.md)).
- Height 36px (touch target 44px), `--radius-full`, border `--color-border`.
- Selected (`aria-pressed="true"`, or `aria-checked="true"` for `role="radio"`): bg `--color-accent-soft`, text and 1.5px border `--color-accent`.
- Variants: `chip--weight .w-N` (group chip, own colours, see GroupPicker), `chip--add` (dashed border `--color-border-strong`, text `--color-accent`; an action, not a radio), `chip--skeleton`, `chip--other` ("Другое…", see ChipRow).
