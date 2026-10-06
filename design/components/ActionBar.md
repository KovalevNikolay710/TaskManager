# ActionBar
Sticky form action bar.
- Mobile: `position: fixed` at bottom (instead of [BottomNav](BottomNav.md)), bg `--color-surface-raised`, `--shadow-nav`, padding `--space-3 --space-4` + safe-area; buttons share width equally: secondary "Отмена"/"Отменить" and primary.
- Desktop (>= 960px): `position: sticky` at the bottom of the content column, `--radius-lg`, `--shadow-lg`; buttons by text width, right-aligned; left caption `--text-sm` muted ("Есть несохранённые изменения"; on new-task "Задача сразу встанет в список по приоритету").
- New-task: always visible. Task screen: only when the form is changed (slides up, `--duration-normal`).
