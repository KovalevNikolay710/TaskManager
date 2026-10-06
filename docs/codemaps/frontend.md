# Frontend codemap

Generated 2026-10-06 after stage 3; update when a merge changes structure.

`web/`: Vite + React + TS. Entry `web/src/main.tsx` (QueryClient with staleTime 0, BrowserRouter, ToastProvider, `registerSW`). `web/vite.config.ts`: react + vite-plugin-pwa (injectManifest, `src/sw.ts`), dev proxy `/api` -> :8080, keeps `dist/.gitkeep`. `web/embed.go` embeds `dist`. Static assets/icons in `web/public/`. Styles: `styles/tokens.css` (copy of `design/tokens.css`), `styles/global.css`, `Component.module.css` beside each component.

## Routes (`App.tsx`) -> pages (`pages/`)

| Path | Page | Notes |
|---|---|---|
| / and * | redirect | to /day |
| /day | DayPage | day plan, DayChart, DateSwitcher, `?quick` quick add |
| /all-tasks | AllTasksPage | list, search, group sections, quick add |
| /tasks/new | NewTaskPage | create form (`TaskForm.module.css` is shared with TaskPage) |
| /tasks/:taskId | TaskPage | detail/edit/delete |
| /groups | GroupsPage | group ladder, weights, CRUD |
| /profile | ProfilePage | notification settings, push device |
| `StubPage.tsx` | unused | not imported anywhere |

## api/ (all through `client.ts`: `request<T>`, `ApiError`, `BASE_URL` = VITE_API_URL + `/api`)

- `types.ts` - Go response/request shapes. `user.ts` - `CURRENT_USER_ID = 1`.
- `tasks.ts` - `fetchUserTasks` GET /tasks/user/:id (filter query), `fetchTask`, `createTask` POST /tasks/, `updateTask` POST /tasks/update/:id, `deleteTask`.
- `days.ts` - `fetchUserDays` GET /days/user/:id, `createDay`, `updateDay` (POST /days/update/:id); `normalizeDay` null-safe. No delete.
- `groups.ts` - `fetchUserGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `reorderGroups`. Does not use GET /groups/:id, /groups/tasks/:id, /groups/add/:id.
- `push.ts` - `fetchPushKey`, `subscribePush`, `unsubscribePush`, `sendTestPush`. `notifications.ts` - `fetchNotificationSettings`, `updateNotificationSettings`.

## hooks/ (React Query; keys in `queryKeys.ts`: tasks, groups, days, task(id), notificationSettings, pushKey; all scoped by CURRENT_USER_ID)

- Queries: `useTasks` [tasks], `useTask` [task,id] (seeds from tasks), `useGroups` [groups], `useDays` [days], `useNotificationSettings` [notificationSettings], `usePushDevice` [pushKey] (push subscription state machine).
- Mutations (invalidate/patch caches): `useTaskMutations` (`useCreateTask`, `useUpdateTask`, `useDeleteTask`; invalidate tasks+days), `useToggleTask` (done/undone), `useGroupMutations` (`useCreateGroup`, `useUpdateGroup`, `useDeleteGroup`, `useReorderGroups`; touch groups+tasks+days), `useDays` (`useCreateDay`, `useUpdateDay`), `useSaveNotificationSettings`, `useQuickAdd` (quick-add draft + create flow).
- UI helpers: `useToast`, `useNow`, `useOnline`, `useGoBack`, `useBeforeUnload`, `useCollapsedGroups`, `useDebouncedValue`, `useFlip`, `useKeyboardInset`, `useTimeDraft`.

## lib/ (pure logic, tests `*.test.ts` beside)

- Priority/tasks: `priority.ts` (client-side priority preview, mirror of Go formula), `tasks.ts` (`sortTasks` by Priority desc, `isDone`, levels), `taskForm.ts` (form validation/limits), `weight.ts`, `groups.ts`, `ladder.ts` (group weight ladder moves).
- Day: `dayPlan.ts` (plan summary for chart), `plan.ts` (time presets), `dates.ts` (date keys, local RFC), `ordinal.ts`, `highlight.ts` (one-shot task highlight between screens).
- Formatting: `format.ts` (durations, plural), `cx.ts` (class names).
- Quick add: `quickAdd.ts` (text parser, drafts).
- Push/notifications: `push.ts` (environment/state), `pushPayload.ts` (shared with SW), `notificationSettings.ts`. `storage.ts` - safe localStorage.

## components/ (one per file + `.module.css`)

- Layout: `AppShell` (header + BottomNav), `AppHeader`, `PageHeader`, `ActionBar`, `SectionTitle`, `AvatarButton`, `ProfileCard`.
- Primitives: `Button` (+`buttonClassName`), `Icon`, `Badge`, `Checkbox`, `Switch`, `Fab`, `Skeleton`, `SearchField`, `ChipRow`, `RadioChips`, `Notice`, `Alert`, `StateMessage` (Empty/ErrorState), `Toast` (+`toastContext`).
- Overlays: `Sheet` (base bottom sheet), `ConfirmSheet`, `GroupSheet`, `QuickAddSheet`.
- Tasks: `TaskRow`, `TaskDetail`, `PriorityCard`, `PriorityChip`, `DeadlineField`, `TimeInput`, `FormParts`, `GroupPicker`, `GroupToggle`, `GroupSection`.
- Groups: `GroupLadder`, `WeightScale`, `WeightTile` (unused).
- Day: `DayChart`, `DateSwitcher`, `PlanForm`.
- Settings: `SettingsCard`.

## sw.ts

Workbox service worker (injectManifest): precache shell, NavigationRoute to `index.html` (denylist `/api`), `/api` network-only, push and notificationclick handlers using `lib/pushPayload.ts`. Built by vite-plugin-pwa to `dist/sw.js`; `tsconfig.sw.json` types it.
