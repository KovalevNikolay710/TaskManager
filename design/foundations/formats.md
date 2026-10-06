# Formats
Time is shown in the browser's local timezone; API returns RFC3339.

| What | Rule | Examples |
|---|---|---|
| Duration (`Task.TimeForExecution`, `Day.TimeForTasks`, stored in minutes) | show and input as `Ч:ММ`: hours without leading zero, minutes always two digits. Screen readers get words | "0:45", "2:00", "2:30", "7:00"; `aria-label="2 часа 30 минут"` |
| Future deadline | today -> "сегодня, ЧЧ:ММ"; tomorrow -> "завтра, ЧЧ:ММ"; 2–6 days -> "через N дней"; further -> "12 окт" (with year if not current) | "сегодня, 18:00", "через 3 дня" |
| Past deadline | "просрочено на N мин/ч/дн" (relative time, not a duration: no `Ч:ММ`) | "просрочено на 2 ч" |
| Day date | "Сегодня, 24 сентября" / "Завтра, 25 сентября" / "Пятница, 26 сентября" | |
| Priority | 1 decimal, comma | "7,5", "0,4"; "<0,1" if 0 < p < 0.1 |
| Count | with declension: "1 задача", "3 задачи", "5 задач" | |
| Deadline in input (decoding) | `DeadlineLabel` + " — через N мин/ч/дн" | "завтра, 10:00 — через 20 ч", "через 3 дня — пт, 27 сентября, 18:00" |
| Service dates (`CreatedAt`, `UpdatedAt`) | today/yesterday -> "сегодня, 11:05" / "вчера, 21:40"; else "20 сентября, 09:12" (year if not current) | |
| Queue place | feminine ordinal | "1-я из 9 активных", "встанет 2-й из 10" |
| Group weight | "×N" + colour of step `--color-weight-N` | "×3" |
| Task time in day plan (`DayTask.Minutes`) | `Ч:ММ` + "сегодня"; multiple of 5 min, >= 0:15 | "1:25 сегодня" |
