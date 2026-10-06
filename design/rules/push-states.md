# Profile: push states and settings states
Source of truth for `web/src/lib/push.ts`, `usePushDevice.ts`, `notificationSettings.ts`. Section names are cited from code ("Состояния push", "Состояния настроек напоминаний", "Эндпоинты"). Screen summary: [profile](../screens/profile.md); notification texts: [reminders](reminders.md).

Two independent sources: (1) **push on this device** — browser API (device property); (2) **reminder settings** — server, per user, shared by all devices. Settings stay editable even when push is off on this device (a laptop without push must not block configuring a phone); a hint under the main row says why nothing arrives.

## Состояния push (this device)
Support check: `'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`. Permission: `Notification.permission` (`default`/`granted`/`denied`), changes via `navigator.permissions.query({name: 'notifications'})` -> `onchange`. Subscription: `(await navigator.serviceWorker.ready).pushManager.getSubscription()`.

| State | When | Switch | Caption and extras |
|---|---|---|---|
| Включены | `granted` + subscription | on | "Включены на этом устройстве" (`--color-success`). Test button active |
| Не включены | `default`, or `granted` without subscription | off | "Напомним о плане и дедлайнах, даже когда приложение закрыто" + hint "Настройки ниже сохранятся, но на это устройство напоминания не придут, пока уведомления выключены". Test `disabled`, under it "Сначала включите push-уведомления" |
| Запрос разрешения | switch turned on, waiting for the system dialog and subscription | on, `switch--pending`, `aria-busy` | "Разрешите уведомления в окне браузера…" |
| Заблокированы | `denied` | off, `disabled` | "Заблокированы в настройках браузера" + warning [Alert](../components/Alert.md) "Уведомления заблокированы" with two paths: installed app — long press on the TaskManager icon -> "О приложении" -> "Уведомления"; browser — icon left of the address -> "Разрешения" -> "Уведомления" -> "Разрешить". Button "Проверить снова". The browser will not show the dialog again |
| Не поддерживается | no `serviceWorker`/`PushManager`/`Notification` | off, `disabled` | "Недоступны в этом браузере" + info Alert: "На Android откройте TaskManager в Chrome и установите на главный экран: ⋮ → «Установить приложение». На iPhone уведомления работают только у приложения, добавленного на экран «Домой» (iOS 16.4 и новее)." |
| Ошибка подписки | `GET /api/push/key`, `pushManager.subscribe` or `POST /api/push/subscribe` failed | off | danger Alert "Не удалось включить уведомления" + error text (network: "Сервер не ответил. Разрешение браузера сохранено — осталось повторить.") + "Повторить" |

## Состояния настроек напоминаний
| State | When | View |
|---|---|---|
| Загрузка | before `GET /api/notifications/settings` | push row works at once; instead of the three reminder rows two skeleton rows |
| Данные | 200 | normal |
| Ошибка загрузки | network or 5xx | instead of reminder rows an Alert "Не удалось загрузить напоминания" + text + "Повторить" |
| Сохранение | after a change | no spinner: applied at once (optimistic). Error: rollback and [Toast](../components/Toast.md) "Не удалось сохранить настройку" + "Повторить" |
| Тест отправляется | `POST /api/push/test` pending | button spinner + "Отправляем…" |
| Тест отправлен | 200 | Toast "Отправили. Уведомление придёт в течение минуты" |

## Эндпоинты
Listed in the API table of `CLAUDE.md`: `GET /api/push/key`, `POST|DELETE /api/push/subscribe`, `POST /api/push/test`, `GET|POST /api/notifications/settings/:user_id` (types in `web/src/api/types.ts`). Settings fields: `MorningEnabled/Time`, `EveningEnabled/Time`, `DeadlineEnabled`, `DeadlineHoursBefore`, `QuietEnabled/From/To`, `Timezone` (times `"ЧЧ:ММ"`, local per `Timezone`).

## Flows
- **Open screen:** (1) check support, permission, `getSubscription()`; (2) `GET settings`; (3) if subscription exists and `granted` — silently `POST /api/push/subscribe` with the same subscription (upsert; server may have lost it); (4) if `Timezone` is empty or differs from `Intl.DateTimeFormat().resolvedOptions().timeZone` — silently `POST settings {"timezone": ...}`. Timezone is never shown.
- **Enable push** (only inside the click handler, or the browser shows no dialog): `Notification.requestPermission()` -> on `granted` `GET /api/push/key` (`{"PublicKey": ...}`, cache) -> `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(PublicKey) })` -> `POST /api/push/subscribe {userId, endpoint, keys: {p256dh, auth}, userAgent}` (= `subscription.toJSON()` + `userId`, `userAgent`) -> `POST settings {"timezone"}`. `denied` -> "Заблокированы"; dialog dismissed (`default`) -> "Не включены", no error. If the POST failed, the browser subscription stays and "Повторить" repeats only that step. If an old subscription with other VAPID keys blocks `subscribe`, `unsubscribe()` it and subscribe again.
- **Disable push:** `subscription.unsubscribe()` at once, then `DELETE /api/push/subscribe {userId, endpoint}`; ignore its error (server removes dead subscriptions itself).
- **"Проверить снова":** re-read permission; no longer `denied` -> "Не включены" or "Включены" if a subscription exists.
- **Settings changes:** `POST settings` with only the changed field (`morningEnabled`, `eveningEnabled`, `deadlineEnabled`, `quietEnabled`, `morningTime`, `eveningTime`, `deadlineHoursBefore`, `quietFrom`, `quietTo`); time fields on `change` of the native picker; empty value is not sent (field reverts). Quiet from == to: not sent, error "Начало и конец не могут совпадать" (`field__hint--error`, `input--error` on both fields). Hint under quiet fields: from later than to -> "Через полночь: до 07:00 следующего дня", else "С 13:00 до 15:00 того же дня".
- **Test:** `POST /api/push/test {userId, endpoint: <this device>}`; button disabled if push is off here. 404/410 -> remove browser subscription, state "Не включены", Toast "Подписка устарела — включите уведомления заново".
- **Click on notification** (`notificationclick` in SW): close it; if an app window is open — `focus()` and navigate to `data.url`; else `clients.openWindow(data.url)`.
