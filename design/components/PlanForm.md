# PlanForm
Day-plan parameters form; used in the empty state of the day screen and in Sheet "Изменить план". The only parameter is time (the app splits it among all suitable tasks; see [day-allocation](../rules/day-allocation.md)).
- [TimeInput](TimeInput.md) "Время на день" (0:15–16:00), below it preset chips "2:00", "4:00", "6:00", "8:00": plain buttons that fill the input. Chip matching the current value: `aria-pressed="true"` (bg `--color-accent-soft`, text and 1.5px border `--color-accent`). See [Chip](Chip.md).
- In "Изменить план" Sheet, if the plan has completed tasks, an info [Alert](Alert.md) under the field: "Выполненное останется в плане: „…“ сохранит свои 1:30. Остальные 4:30 разделим заново…" (several: "3 выполненные задачи сохранят свои 2:15"). Lower bound of the time = sum of completed slots' minutes.
- Field labels `--text-sm` medium, hints `--text-xs` muted.
