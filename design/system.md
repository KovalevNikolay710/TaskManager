# TaskManager design system (index)
Read this index, then only the files you need. Screens: `screens/<screen>.md` (summary) + `.html` (mockup, exact copy). `web/src` is the source of truth for implemented screens.

## Principles
- **Priority is the main order.** Task lists are sorted by `Priority` desc; order is the main signal, indicator colour secondary; never large priority text.
- **Calm UI.** One accent (`--color-accent`): actions and active nav only. Red/amber: priority and deadlines only. `--color-weight-1…10`: group weight and its derivatives (ladder, day sectors).
- **Mobile-first**, base 360–430px; from 960px side nav, content centred, `max-width: var(--layout-max-width)`.
- Tap targets >= 44px (`--size-touch`).
- Every screen has loading (skeleton), empty (hint + action), error ("Повторить") states.
- UI text in Russian, human dates ([formats](foundations/formats.md)).
- Contrast >= WCAG AA (text 4.5:1, UI graphics 3:1); colour never carries meaning alone (number, text, "×N").

## Where things live
- `tokens.css` — only source of values (colours, type, spacing, radii, shadows, sizes); light + dark. Use only `var(--...)`.
- `components.css` — reference markup/CSS for the classes named in component files; block `.mock-panel` is mockup-only, not for the frontend.
- `icons/` — app icons, `README.md`.
- `rules/` — precise rules cited by code: [day-allocation](rules/day-allocation.md), [ladder-insert](rules/ladder-insert.md), [quick-add-rules](rules/quick-add-rules.md), [task-form](rules/task-form.md), [reminders](rules/reminders.md), [push-states](rules/push-states.md).

## Foundations
- [layout](foundations/layout.md) — AppShell, breakpoints, screen map and navigation.
- [weight-scale](foundations/weight-scale.md) — group weight ×1…×10 colours, `.w-N`, contrast rules; not the task priority scale.
- [formats](foundations/formats.md) — durations `Ч:ММ`, dates, priority, counts, queue place.
- [icons](foundations/icons.md) — icon set, PWA app icon.

## Components
Layout and navigation
- [AppShell](foundations/layout.md) — screen frame
- [AppHeader](components/AppHeader.md) — top bar with title/subtitle/avatar; day, all-tasks, profile
- [PageHeader](components/PageHeader.md) — header with back button; task, new-task, groups
- [BottomNav](components/BottomNav.md) — mobile nav "День" / "Все задачи"; day, all-tasks, groups, profile
- [SideNav](components/SideNav.md) — desktop nav
- [AvatarButton](components/AvatarButton.md) — round profile button; AppHeader, SideNav
- [Fab](components/Fab.md) — add-task button (mobile); day, all-tasks

Core
- [Button](components/Button.md) — primary, secondary, ghost, icon, danger, loading
- [Chip](components/Chip.md) — pill for presets and single choice; forms, quick add
- [SearchField](components/SearchField.md) — client-side search; all-tasks
- [Checkbox](components/Checkbox.md) — done toggle; TaskRow
- [PriorityIndicator](components/PriorityIndicator.md) — bar + number chip, relative levels; TaskRow, PriorityCard
- [TaskRow](components/TaskRow.md) — task card, incl. "day slot" variant; all-tasks, day
- [DeadlineLabel](components/DeadlineLabel.md) — deadline text and colour; TaskRow, DeadlineField
- [GroupSection](components/GroupSection.md) — collapsible group block; all-tasks
- [DateSwitcher](components/DateSwitcher.md) — day navigation; day
- [DayChart](components/DayChart.md) — donut of the day plan; day
- [PlanForm](components/PlanForm.md) — plan time + presets; day
- [TimeInput](components/TimeInput.md) — `Ч:ММ` input; day plan, task forms
- [Sheet](components/Sheet.md) — modal panel; day, groups, forms, quick add
- [Badge](components/Badge.md), [SectionTitle](components/SectionTitle.md), [Skeleton](components/Skeleton.md), [EmptyState](components/EmptyState.md), [ErrorState](components/ErrorState.md), [Toast](components/Toast.md)

Forms (new-task, task, groups)
- [FormCard](components/FormCard.md) — form block; new-task, task
- [Field](components/Field.md) — label/Input/Textarea/hint/error rules; forms
- [TitleInput](components/TitleInput.md) — in-place task name; task
- [DeadlineField](components/DeadlineField.md) — date + time + presets + validation; new-task, task, quick add
- [GroupPicker](components/GroupPicker.md) — group radio chips; new-task, task, quick add
- [GroupForm](components/GroupForm.md) — group create/edit in Sheet; new-task, task, groups
- [WeightScale](components/WeightScale.md) — mini ladder slider for weight; GroupForm
- [PercentSlider](components/PercentSlider.md) — progress; task
- [PriorityCard](components/PriorityCard.md) — priority explanation and forecast; new-task, task
- [StatusBanner](components/StatusBanner.md) — done banner / "Отметить выполненной"; task
- [ActionBar](components/ActionBar.md) — sticky save/cancel bar; new-task, task
- [Alert](components/Alert.md) — error/info/warning message; forms, Sheets, profile
- [ConfirmSheet](components/ConfirmSheet.md) — confirm irreversible action; task, groups, new-task
- [GroupLadder](components/GroupLadder.md) — ladder of 10 steps, drag and placement; groups
- [PlaceBanner](components/PlaceBanner.md) — placement-mode banner; groups
- [WeightTile](components/WeightTile.md) — weight square (unused)
- [MetaNote](components/MetaNote.md) — created/updated line; task

Quick add
- [QuickAddSheet](components/QuickAddSheet.md) — one-action task entry; all-tasks, day
- [ChipRow](components/ChipRow.md) — one-line single-select row; QuickAddSheet
- [GroupToggle](components/GroupToggle.md) — current group chip; QuickAddSheet
- [Notice](components/Notice.md) — neutral environment banner ("Нет сети"); QuickAddSheet

Settings
- [ProfileCard](components/ProfileCard.md) — user card; profile
- [SettingsCard](components/SettingsCard.md) — settings rows; profile
- [Switch](components/Switch.md) — instant on/off toggle; profile
