# SideNav (desktop >= 960px)
- Full-height vertical panel, background `--color-surface`, right border `--color-border`, width `--size-side-nav`.
- Top: name "TaskManager" (`--text-lg` semibold); then items "День", "Все задачи", "Группы" (icon `folder`): icon + label in a row, height 44px, `--radius-md`; active: background `--color-accent-soft`, text `--color-accent`.
- Bottom: profile block: [AvatarButton](AvatarButton.md) + user name; active on `/profile` (`aria-current="page"`, background `--color-accent-soft`).
