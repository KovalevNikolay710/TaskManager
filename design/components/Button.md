# Button
| Variant | Look | Use |
|---|---|---|
| primary | bg `--color-accent`, text `--color-text-inverse` | main action ("Спланировать день") |
| secondary | bg `--color-surface`, border `--color-border`, text `--color-text` | "Повторить", secondary actions |
| ghost | no bg, text `--color-accent` | in-row actions, "Показать выполненные" |
| icon | 44x44, no bg, icon `--color-text-muted` | date arrows, clear search |
| danger | bg `--color-danger`, text `--color-text-inverse`, hover `--color-danger-hover` | only to confirm an irreversible action in [ConfirmSheet](ConfirmSheet.md) |
| danger-ghost | no bg, text `--color-danger`, hover bg `--color-danger-soft` | entry to deletion ("Удалить задачу", "Удалить группу"); always at the bottom of screen/Sheet, apart from main actions |

- `btn--block` = full width.
- Loading: `disabled` + `aria-busy="true"`, `spinner` on the left (16px, 2px border `currentColor`), text becomes the process ("Создаём…", "Сохраняем…", "Удаляем…"); width must not jump.
- Height 44px, `--radius-md`, `--text-md` medium, horizontal padding `--space-4`. Hover: `--color-accent-hover` (primary) / `--color-surface-sunken` (others). Disabled: opacity 0.5. Focus: `outline: 2px solid var(--color-focus); outline-offset: 2px`.
