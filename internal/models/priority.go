package models

import "time"

// MinHoursUntilDeadline — новый дедлайн должен быть не раньше чем через час:
// Tl считается в целых часах и стоит в знаменателе формулы.
const MinHoursUntilDeadline = 1

// HoursUntilDeadline — целые часы от now до дедлайна (Tl); для прошедшего дедлайна — 0 или меньше.
func HoursUntilDeadline(deadline, now time.Time) int {
	return int(deadline.Sub(now).Hours())
}

// CalculatePriority считает приоритет по уже сохранённым в задаче полям: Pt = Pg * Te / Tl * %in.
// Tl (NumberOfHoursUntilDL) должен быть ≥ 1; для пересчёта от текущего времени используйте Recalculate.
func (t *Task) CalculatePriority() {
	t.Priority = float64(t.GroupPriorty) * float64(t.TimeForExecution) / float64(t.NumberOfHoursUntilDL) * float64(100-t.PercentOfCompleting) / float64(100)
}

// Recalculate — единственная точка пересчёта: Tl от now и приоритет задачи.
// Для просроченной задачи (и задачи, до дедлайна которой меньше часа) Tl = 1:
// приоритет максимальный для её параметров и без деления на ноль.
func (t *Task) Recalculate(now time.Time) {
	t.NumberOfHoursUntilDL = max(HoursUntilDeadline(t.DeadLine, now), MinHoursUntilDeadline)
	t.CalculatePriority()
}
