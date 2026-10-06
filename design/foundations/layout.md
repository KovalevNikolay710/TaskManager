# Layout, AppShell, screen map

## AppShell
Frame of every screen.
- Mobile (< 960px): [AppHeader](../components/AppHeader.md) on top (sticky), content, [BottomNav](../components/BottomNav.md) at bottom (fixed). Content bottom padding: `calc(var(--size-bottom-nav) + env(safe-area-inset-bottom) + var(--space-4))`.
- Desktop (>= 960px): [SideNav](../components/SideNav.md) on the left (`--size-side-nav`), content on the right centred with `max-width: var(--layout-max-width)`, BottomNav hidden.
- Page bg `--color-bg`; horizontal padding `--space-4` (mobile) / `--space-8` (desktop).

## Screen map and navigation
| Route | Screen | Header | BottomNav (mobile) | Active SideNav item |
|---|---|---|---|---|
| `/day` | Задачи на день | AppHeader | yes, "День" | День |
| `/all-tasks` | Все задачи | AppHeader (+ "Группы" icon button on mobile) | yes, "Все задачи" | Все задачи |
| `/groups` | Группы | PageHeader (back -> `/all-tasks`) | yes, "Все задачи" | Группы |
| `/tasks/new` | Новая задача | PageHeader | **no** — ActionBar at bottom | Все задачи |
| `/tasks/:taskId` | Задача | PageHeader | **no** — ActionBar when changed | Все задачи |
| `/profile` | Профиль и уведомления | AppHeader without AvatarButton | yes, no active item | profile block at bottom (`aria-current`) |
| `?quick=1` on `/all-tasks` and `/day` | QuickAddSheet over the screen | — | covered by backdrop | as the screen below |

- Form screens (`/tasks/new`, `/tasks/:taskId`) are "nested": no BottomNav on mobile so the sticky save bar and the on-screen keyboard do not fight for the bottom. Exit via PageHeader "back".
- "Группы" is a section inside "Все задачи", so BottomNav keeps "Все задачи" active and has no third item; on desktop "Группы" is its own SideNav item.
- Root `/` redirects to `/day`.
