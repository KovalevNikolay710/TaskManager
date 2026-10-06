# DeadlineField
Deadline = date + time. `<fieldset>` with `<legend>` "Дедлайн"; inputs have `aria-label` "Дата дедлайна" / "Время дедлайна".
- Row of two `Input`s: `type="date"` (1.3fr) and `type="time"` (1fr); native pickers.
- Below: preset [Chip](Chip.md)s (not on the task screen; not in QuickAddSheet where the sheet has its own row): "Сегодня, 21:00" (hidden if now is after 20:00), "Завтра, 18:00", "Через 3 дня" (18:00), "Через неделю" (18:00). The chip matching the value is `aria-pressed`.
- Only date chosen: time defaults to 18:00.
- Live decoding below: [DeadlineLabel](DeadlineLabel.md) format + relative time: "завтра, 10:00 — через 20 ч" (colour per DeadlineLabel, icon `flag`). Empty: hint "Не раньше чем через час".
- Validation: both parts filled; deadline >= now + 1 h (backend computes `Tl` in whole hours and rejects 0). Errors: "Дедлайн уже прошёл. Выберите время хотя бы на час позже текущего" / "Слишком близко: дедлайн должен быть хотя бы через час". Empty: "Укажите дату и время дедлайна".
