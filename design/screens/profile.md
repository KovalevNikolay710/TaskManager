# Профиль и уведомления
Mockup `profile.html` holds exact copy for all states (switcher panel is mockup-only). Code is the source of truth. **Purpose:** enable reminders (morning plan, evening check, deadline soon). No login: "Пользователь #1". **Route:** `/profile` (AvatarButton / SideNav profile block).

Push states, settings states, flows, endpoints: [push-states](../rules/push-states.md). Notification texts and delivery rules: [reminders](../rules/reminders.md) (cited by backend code, `CLAUDE.md`).

## Data (`userId` = `CURRENT_USER_ID`)
- Push on this device: browser API. Settings: `GET /api/notifications/settings/:id` -> `MorningEnabled/Time`, `EveningEnabled/Time`, `DeadlineEnabled`, `DeadlineHoursBefore`, `QuietEnabled/From/To`, `Timezone`; `POST` only the changed camelCase field.
- Deadline chips "1 ч / 3 ч / 6 ч / 12 ч / 24 ч" (radiogroup, default 3). Quiet hours affect only "Дедлайн скоро".

## Layout
[AppHeader](../components/AppHeader.md) "Профиль" (no avatar) -> [ProfileCard](../components/ProfileCard.md) -> [SectionTitle](../components/SectionTitle.md) "Уведомления" -> [SettingsCard](../components/SettingsCard.md), rows with [Switch](../components/Switch.md): "Push-уведомления" (`bell`), "Утром: составить план" (`sun`, time 08:00), "Вечером: отметить сделанное" (`moon`, 21:00), "Дедлайн скоро" (`flag`, "За N ч"), "Тихие часы" (`bell-off`, "С … до …"); foot: secondary "Отправить тестовое уведомление" (`send`). Parameters show only while the setting is on; the value is kept when off.
Reminders stay configurable when push is off on this device.

## Components
AppHeader, ProfileCard, SettingsCard, Switch, SectionTitle, `Input type="time"` (`input--time`), [Chip](../components/Chip.md), [Button](../components/Button.md), [Alert](../components/Alert.md) (error/info/warning), [Skeleton](../components/Skeleton.md), [Toast](../components/Toast.md), [BottomNav](../components/BottomNav.md) (no active item) / [SideNav](../components/SideNav.md) (profile block active).

## Responsive
Mobile: parameter wraps under the title (indent = icon width). >= 960px: column 720px.

## Open questions
Defaults all-on may be intrusive (alternative: only "Дедлайн скоро"). Theme switcher and "Установить приложение" button are not on the screen.
