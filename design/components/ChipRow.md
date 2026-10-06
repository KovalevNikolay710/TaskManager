# ChipRow
Single-select chip row in one line — a compact replacement for "label + chips".
- Grid: row icon 24px (`chip-row__lead`, 16px `--color-text-muted`: `flag`, `clock`, `folder`) + scroll area (`chip-row__scroll`). Row label = `legend.visually-hidden` and `aria-label` of `role="radiogroup"`.
- Mobile: no wrap, horizontal scroll without bar. The row goes under the right edge of the sheet (`margin-right: -16px`) with a 32px fade (`mask-image`); at scroll end the fade is removed (`chip-row--end`). The selected chip scrolls into view on show (`scrollIntoView({inline: 'nearest'})`).
- Desktop (>= 960px): chips wrap, no scroll/fade.
- Chips: [Chip](Chip.md) with `role="radio"` + `aria-checked`, arrows left/right (roving tabindex). 44px vertical target kept by 4px padding of the scroll area.
- "Другое…" chip (`chip--other`): `role="radio"` + `aria-expanded` + `aria-controls`; expands a field under the row. With a valid value the chip label becomes the value ("пт, 9 окт, 12:00", "3:30"). Tap again collapses (if valid); tapping another chip collapses and selects it.
