# TimeInput
Duration input in `Ч:ММ`; API gets integer minutes.
- Look: height 44px, width ~120px, bg `--color-surface-sunken`, `--radius-md`, text `--text-lg` semibold tabular-nums centred; placeholder "0:00"; small suffix "ч:мм" `--text-xs` muted at right. Focus: 2px `--color-focus`.
- `inputmode="numeric"`, `aria-label` = field label, `aria-describedby` = hint/error.
- Parsing: "2:30" -> 150; "2" -> 120 (whole hours); "230" without colon -> 2:30 (last two digits are minutes). Minutes 00–59. On blur normalised to `Ч:ММ` ("2:5" -> "2:05").
- Day plan limits: 0:15–16:00. Error (border + hint `--color-danger`): "Введите время в формате ч:мм, например 2:30" / "Не больше 16:00"; primary button of the form disabled.
- Task limits (`Task.TimeForExecution`): 0:05–99:59, presets "0:30", "1:00", "2:00", "4:00". In long task forms the primary button is **not** blocked — errors show on blur and on submit (see [Field](Field.md)).
- Group weight is chosen with [WeightScale](WeightScale.md), not a stepper.
