# BottomNav (mobile)
- Two items in order: "День" (calendar icon), "Все задачи" (list icon).
- Height `--size-bottom-nav` + `env(safe-area-inset-bottom)`, background `--color-surface-raised`, shadow `--shadow-nav`.
- Item: 24px icon above label `--text-xs` medium; each item is half the screen width (touch target).
- Active: icon and label `--color-accent`, pill behind icon `--color-accent-soft` (56x32, `--radius-full`). Inactive: `--color-text-muted`.
- `<nav aria-label="Основная навигация">`, active item `aria-current="page"`.
- Hidden on form screens (see [layout](../foundations/layout.md)); hidden >= 960px.
