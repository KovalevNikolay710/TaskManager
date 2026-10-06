# Fab (button "Добавить задачу")
- Round 56px, `--color-accent`, "+" icon `--color-text-inverse`, `--shadow-lg`. Mobile only: right, above [BottomNav](BottomNav.md) (`--space-4` from edge), on all-tasks and day.
- Desktop: no Fab; primary "Новая задача" in [AppHeader](AppHeader.md) and key `N` (check `event.code === 'KeyN'`, ignored while focus is in an input or another Sheet is open).
- `aria-label="Добавить задачу"`, `aria-haspopup="dialog"`. Opens [QuickAddSheet](QuickAddSheet.md), not `/tasks/new`. On close focus returns to the Fab.
