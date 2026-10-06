# Day plan: time allocation "Pace + remainder"
Source of truth for `AllocateDayTime` (`internal/services/day_plan.go`, tests in `day_plan_test.go` use Examples 1–4). Formerly `design/screens/day.md`, "Требуется от бэкенда", item 2.

## Idea (UI-level)
- Every task in the plan gets **at least 0:15**.
- First each task gets its "pace": remaining work divided by days to deadline. If the day's time is not enough even for that, time is split proportionally to `Pt`. Any surplus is also split proportionally to `Pt`, but a task never gets more than it has left to do. What is not handed out is "Свободно".
- The plan is fixed when built. Marking a task done does not redistribute time (its sector stays and turns grey). Redistribution only via "Пересобрать план".

## Input
- `T` = `Day.TimeForTasks`, minutes (15–960). On rebuild: `T - sum(Minutes of completed slots)` (see Rebuild).
- Candidates: user's tasks with `Status = 1` and `Deadline` later than the start of `Day.Date`. Before computing, refresh `HoursUntilDeadline` and `Priority` for each candidate from the current moment (`task.Recalculate(now)`); saving them is not required.
- Constants: `Q = 15` min slot, `STEP = 5` rounding step.

## Per candidate `i`
- `W = Te * (100 - %) / 100` remaining work, min (`Te` = `TimeForExecution`, `%` = `PercentOfCompleting`);
- `D = max(1, ceil(H / 24))` days to deadline; `H` = hours from `max(now, start of plan day)` to `Deadline` (plan for today: `H` = `HoursUntilDeadline`);
- `need = W / D` pace, min/day;
- `cap = max(Q, roundUp5(W))` — never give more;
- `base = min(max(Q, roundUp5(need)), cap)` — what the task gets first.
- If `W < 15` the task still gets 15 (`cap = max(Q, ...)`): a slot is a minimum attention span; slots under 15 do not exist.

## Steps
1. Sort candidates by `Pt` desc; ties: earlier `Deadline`, then smaller `TaskId`.
2. If `Q * n > T`, only the first `k = floor(T / Q)` candidates enter the plan, others do not. `k = 0` -> empty plan.
3. `S = sum(base)`.
4. **Not enough (`S > T`)**: find `lambda >= 0` with `sum(clamp(lambda * Pt_i, Q, base_i)) = T`; `x_i = clamp(lambda * Pt_i, Q, base_i)`. Monotonic in `lambda`; a solution exists since `Q * k <= T < S`. Binary search (60 iterations) or breakpoint sort. Ceiling per task here is `base`.
5. **Enough (`S <= T`)**: if `sum(cap) <= T`, `x_i = cap_i` and the remainder `T - sum(cap)` is free. Else find `lambda >= 0` with `sum(min(base_i + lambda * Pt_i, cap_i)) = T`; `x_i = min(base_i + lambda * Pt_i, cap_i)` (water-filling). Ceiling per task here is `cap`.
6. **Round to 5 min**, largest remainder: `a_i = floor(x_i / 5) * 5`, `L = T - sum(a_i)`. While `L >= 5`, add 5 to tasks with the largest fraction `x_i - a_i` (ties: `Pt` desc), not exceeding the ceiling of step 4/5 and at most once per task. Result: every `a_i >= 15`, multiple of 5, `sum(a_i) <= T`. `T - sum(a_i)` (including 1–4 min if `T` is not a multiple of 5) is free time — not stored, the client computes it.
7. Save `(DayId, TaskId, Minutes = a_i)` per planned task.

## Examples
**1. Enough time.** 24 Sep, 08:00, `T = 360`.

| Task | Pg | Te | % | H | Pt | W | D | need | base | cap | x | **Minutes** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Код-ревью задачи по API | 2 | 90 | 0 | 10 | 18,0 | 90 | 1 | 90 | 90 | 90 | 90,0 | **90** |
| Подготовить отчёт по ТИПИС | 3 | 180 | 40 | 26 | 12,5 | 108 | 2 | 54 | 55 | 110 | 84,1 | **85** |
| Лабораторная №4 по БД | 3 | 120 | 0 | 74 | 4,9 | 120 | 4 | 30 | 30 | 120 | 41,4 | **40** |
| Пробежка 5 км | 1 | 45 | 0 | 14 | 3,2 | 45 | 1 | 45 | 45 | 45 | 45,0 | **45** |
| Гитара: разобрать «Группу крови» | 2 | 600 | 20 | 336 | 2,9 | 480 | 14 | 34,3 | 35 | 480 | 41,7 | **40** |
| Купить продукты на неделю | 1 | 60 | 0 | 36 | 1,7 | 60 | 2 | 30 | 30 | 60 | 33,9 | **35** |
| Прочитать главу «Чистой архитектуры» | 2 | 240 | 50 | 144 | 1,7 | 120 | 6 | 20 | 20 | 120 | 23,9 | **25** |

`S = 305 <= 360`, `sum(cap) = 1025 > 360` -> step 5. Extra 55 min split by `Pt` among tasks not yet at `cap` (code review and run are at cap): `lambda ~ 2,34`. `floor` gives 345; the remaining 15 min go +5 to the largest fractions: report (4,1), groceries (3,9), "Чистая архитектура" (3,9). Total 360, nothing free.

**2. Not enough.** Same tasks, `T = 240`. `S = 305 > 240` -> step 4, `lambda ~ 5,95`: code review `min(107, 90)` = **90**; report `min(74, 55)` = **55**; lab 28,9 -> **30**; run 19,1 -> **20**; guitar 17,0 -> **15**; groceries `max(9,9; 15)` -> **15**; "Чистая архитектура" **15**. Sum 240. The run (deadline today) gets less than its pace (20 of 45) because its `Pt` is lower than the lab's: when time is short, `Pt` decides.

**3. Tasks do not fit.** Same tasks, `T = 90`. `15 * 7 = 105 > 90` -> `k = 6`. "Чистая архитектура" is out (`Pt` 1,7 equals groceries but later deadline). Six tasks at **15**.

**4. Free time.** Code review, report, run, groceries; `T = 480`. `sum(cap) = 90 + 110 + 45 + 60 = 305 <= 480`. All get `cap`; free 175 min = 2:55.

## Rebuild (`POST /api/days/update/:id`)
1. Slots of tasks that are currently `Status = 2` keep their `Minutes`.
2. `R = T - sum(Minutes)` of those. If `T` is less than the sum -> 400 `{"error": "Время дня меньше уже выполненного (1:30)"}` (sum as `Ч:ММ`).
3. Run the algorithm with `T = R` over candidates: active tasks, including ones previously in the plan, new ones and ones returned to work. `R < 15` -> no active slots.
4. Active slots are replaced in one transaction.
Example: from Example 1 "Код-ревью" is done (90), rebuild with `T = 420`: `R = 330`, six active tasks get 110 / 55 / 45 / 50 / 40 / 30; code review keeps 90.

## Plan is fixed between rebuilds
- Marking, unmarking, or editing a task does **not** change `Minutes`.
- Deleting a task deletes its slot (cascade on `day_tasks`); the time becomes free.
- `GET /api/days/:id` returns the stored plan and never rebuilds it.
- Minutes live in `day_tasks.minutes` (model `DayTask`), exposed as `Day.Slots`; `Minutes = 0` for all slots = old-version plan (client shows "Старый план").
