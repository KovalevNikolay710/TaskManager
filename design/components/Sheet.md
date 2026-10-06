# Sheet
Modal panel. Variants: regular and `sheet--quick` ([QuickAddSheet](QuickAddSheet.md): desktop width `--size-quick-sheet`, pinned to top via `sheet-backdrop--top`).
- Mobile: slides up from bottom, `--radius-lg` on top, handle 36x4 `--color-border-strong`, bg `--color-surface-raised`. Desktop: 420px dialog centred. Backdrop `rgba(10,12,20,.45)`.
- Title `--text-lg` semibold + icon button "×". Bottom: two equal buttons: secondary "Отмена" and the primary action.
- Closes on backdrop, "×", Esc; focus trapped inside, returns to the invoker on close. `role="dialog" aria-modal="true"`. See also [ConfirmSheet](ConfirmSheet.md).
