# PageHeader
Header of nested screens: task, new-task, groups.
- Row height >= 60px: icon button "back" (`chevron-left`, `--color-text`, `aria-label="Назад"`), title `--text-lg` semibold, one line with ellipsis, optional right actions (ghost buttons).
- Sticky, background `--color-bg`; bottom border `--color-border` on scroll (class `page-header--scrolled`). Desktop: title `--text-2xl`, top padding `--space-6`.
- Back: `history.back()` if the app has a previous page, else parent screen (`/all-tasks`). With unsaved changes first [ConfirmSheet](ConfirmSheet.md) "Выйти без сохранения?".
- No avatar.
