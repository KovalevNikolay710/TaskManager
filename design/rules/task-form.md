# Task form: validation and server errors
Source of truth for `web/src/lib/taskForm.ts`; used by new-task and task screens (and QuickAddSheet). Previously `screens/new-task.md`, "Валидация" / "Ошибки сервера".

## Валидация
| Field | Rule | Error text |
|---|---|---|
| Name | non-empty after trim, <= 200 chars | "Введите название задачи" |
| Deadline | date and time filled | "Укажите дату и время дедлайна" |
| Deadline | not earlier than `now + 1 h` (backend computes `Tl` in whole hours, rejects 0) | past: "Дедлайн уже прошёл. Выберите время хотя бы на час позже текущего"; within the next hour: "Слишком близко: дедлайн должен быть хотя бы через час" |
| Time to execute | parsed by `parseDuration` (`web/src/lib/format.ts`) | "Введите время в формате ч:мм, например 1:30" |
| Time to execute | 0:05–99:59 | "Минимум 0:05" / "Не больше 99:59" |
| Description | optional, <= 2000 chars | — |

- Warning (not blocking), under time: `Te` larger than time to deadline: "До дедлайна 3 ч, а задача займёт 5:00 — может не хватить времени".
- Task screen exception: if the deadline was **not changed** and is already overdue or within the hour, it is not an error; the field shows "просрочено на 3 ч" in danger and other fields still save.

## Ошибки сервера
Text from `ApiError.message` (`{"error": "..."}`).
| Response | Show |
|---|---|
| network (`status = 0`) | Alert "Не удалось создать задачу" / "Не удалось связаться с сервером. Всё, что вы ввели, сохранено — попробуйте ещё раз." |
| 400/500 with text containing "дедлайн" / "дата" (deadline became closer than an hour) | field error at "Дедлайн": "Слишком близко: дедлайн должен быть хотя бы через час", focus on the date field, no Alert |
| 400 (binding) | Alert "Сервер не принял данные" + error text small |
| other 4xx/5xx | Alert "Не удалось создать задачу" + text from response |
