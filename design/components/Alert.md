# Alert
Message inside a form or Sheet (unlike [ErrorState](ErrorState.md), which replaces the screen).
- Error (default): bg `--color-danger-soft`, `--radius-md`, icon `alert-triangle` `--color-danger`, title semibold `--text-sm` ("Не удалось создать задачу") + muted error text. `role="alert"`; on appear takes focus (`tabindex="-1"`) and scrolls into view.
- `alert--info`: bg `--color-accent-soft`, icon `info` `--color-accent`, no `role="alert"`, no focus grab (e.g. "Выполненное останется в плане", "Браузер не умеет присылать уведомления").
- `alert--warning`: bg `--color-warning-soft`, icon `alert-triangle` `--color-warning`, no `role="alert"` (action needed outside the app: "Уведомления заблокированы").
- May contain a steps list (`alert__steps`, `--text-sm` muted) and buttons (`alert__actions`: secondary 36px, 44px target).
- Exception in [QuickAddSheet](QuickAddSheet.md): does not take focus (the phone keyboard would close); announced via `role="alert"`.
