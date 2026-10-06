# AppHeader
Top bar of the main screens (day, all-tasks, profile). Sticky.
- Left: screen title (`--text-xl` semibold; desktop `--text-2xl`), below it subtitle (`--text-sm`, `--color-text-muted`), e.g. "12 активных · 3 выполнено".
- Right: [AvatarButton](AvatarButton.md). On desktop the avatar moves to the bottom of [SideNav](SideNav.md), not duplicated. On the profile screen there is no avatar.
- Desktop, all-tasks and day: primary button "Новая задача" opens [QuickAddSheet](QuickAddSheet.md) (not `/tasks/new`).
- All-tasks, mobile: icon button before the avatar: icon `folder`, colour `--color-text`, `aria-label="Группы"`, goes to `/groups`. Hidden on desktop (SideNav has the item).
- Background `--color-bg`; bottom border `--color-border` appears on scroll.
