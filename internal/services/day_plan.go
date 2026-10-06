package services

import (
	"TaskManager/internal/models"
	"math"
	"sort"
	"time"
)

// Распределение времени дня между задачами — алгоритм «Темп + остаток» (design/rules/day-allocation.md).
// Функции здесь чистые: без БД и без текущего времени внутри.

const (
	// planMinSlot — минимальный слот задачи в плане (Q), минуты
	planMinSlot = 15
	// planStep — шаг округления слотов, минуты
	planStep = 5
	// planSearchIterations — итерации бинарного поиска λ; 100 с запасом хватает для точности float64
	planSearchIterations = 100
	// priorityEpsilon — относительная точность сравнения Pt: равные по формуле приоритеты
	// (1·60/36 и 2·240/144·0,5) в float64 могут отличаться в последнем знаке
	priorityEpsilon = 1e-9
)

// PlanCandidate — задача-кандидат в план дня.
type PlanCandidate struct {
	TaskId   int64
	Priority float64   // Pt, уже пересчитанный от текущего момента
	Deadline time.Time // для порядка при равных Pt
	Work     float64   // W — оставшаяся работа, минуты
	Days     int       // D — дней до дедлайна, ≥ 1
}

// PlanSlot — сколько минут задача получает в плане дня.
type PlanSlot struct {
	TaskId  int64
	Minutes int
}

// newPlanCandidate считает W и D задачи для плана, начинающегося в dayStart.
// Для плана на сегодня (dayStart ≤ now) H — это Tl задачи (HoursUntilDeadline, уже пересчитанный),
// для будущего дня — целые часы от начала дня до дедлайна.
func newPlanCandidate(task *models.Task, dayStart, now time.Time) PlanCandidate {
	hours := task.HoursUntilDeadline
	if dayStart.After(now) {
		hours = max(models.HoursUntilDeadline(task.Deadline, dayStart), models.MinHoursUntilDeadline)
	}
	return PlanCandidate{
		TaskId:   task.TaskId,
		Priority: task.Priority,
		Deadline: task.Deadline,
		Work:     float64(task.TimeForExecution) * float64(100-task.PercentOfCompleting) / 100,
		Days:     max(1, int(math.Ceil(float64(hours)/24))),
	}
}

func samePriority(a, b float64) bool {
	return math.Abs(a-b) <= priorityEpsilon*math.Max(math.Abs(a), math.Abs(b))
}

// sortPlanCandidates: Pt ↓, при равенстве — более ранний дедлайн, затем меньший TaskId.
func sortPlanCandidates(candidates []PlanCandidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		if !samePriority(a.Priority, b.Priority) {
			return a.Priority > b.Priority
		}
		if !a.Deadline.Equal(b.Deadline) {
			return a.Deadline.Before(b.Deadline)
		}
		return a.TaskId < b.TaskId
	})
}

func roundUpToStep(x float64) float64 {
	return math.Ceil(x/planStep-1e-9) * planStep
}

// AllocateDayTime делит total минут между кандидатами. Возвращает слоты в порядке Pt ↓;
// каждый слот ≥ 15 мин и кратен 5, сумма ≤ total. Остаток — свободное время, он не возвращается.
func AllocateDayTime(total int, candidates []PlanCandidate) []PlanSlot {
	if total < planMinSlot || len(candidates) == 0 {
		return []PlanSlot{}
	}
	sorted := append([]PlanCandidate(nil), candidates...)
	sortPlanCandidates(sorted)

	// Шаг 2: каждой задаче нужно хотя бы 15 минут — лишние кандидаты в план не попадают
	if k := total / planMinSlot; len(sorted) > k {
		sorted = sorted[:k]
	}
	n := len(sorted)
	T := float64(total)

	base := make([]float64, n)
	caps := make([]float64, n)
	sumBase, sumCap := 0.0, 0.0
	for i, c := range sorted {
		need := c.Work / float64(max(c.Days, 1))
		caps[i] = math.Max(planMinSlot, roundUpToStep(c.Work))
		base[i] = math.Min(math.Max(planMinSlot, roundUpToStep(need)), caps[i])
		sumBase += base[i]
		sumCap += caps[i]
	}

	x := make([]float64, n)
	ceiling := caps
	switch {
	case sumBase > T:
		// Шаг 4: не хватает даже на темп — Σ clamp(λ·Pt, Q, base) = T
		ceiling = base
		fill := func(lambda float64) float64 {
			sum := 0.0
			for i, c := range sorted {
				x[i] = math.Min(math.Max(lambda*c.Priority, planMinSlot), base[i])
				sum += x[i]
			}
			return sum
		}
		solveLambda(T, fill, func() float64 {
			hi := 0.0
			for i, c := range sorted {
				if c.Priority > 0 {
					hi = math.Max(hi, base[i]/c.Priority)
				}
			}
			return hi
		}())
	case sumCap <= T:
		// Шаг 5, всё помещается: каждая задача получает свой потолок, остаток свободен
		copy(x, caps)
	default:
		// Шаг 5, water-filling: Σ min(base + λ·Pt, cap) = T
		fill := func(lambda float64) float64 {
			sum := 0.0
			for i, c := range sorted {
				x[i] = math.Min(base[i]+lambda*c.Priority, caps[i])
				sum += x[i]
			}
			return sum
		}
		solveLambda(T, fill, func() float64 {
			hi := 0.0
			for i, c := range sorted {
				if c.Priority > 0 {
					hi = math.Max(hi, (caps[i]-base[i])/c.Priority)
				}
			}
			return hi
		}())
	}

	minutes := roundSlots(total, sorted, x, ceiling)
	slots := make([]PlanSlot, n)
	for i, c := range sorted {
		slots[i] = PlanSlot{TaskId: c.TaskId, Minutes: minutes[i]}
	}
	return slots
}

// solveLambda находит бинарным поиском наибольшее λ из [0, hi], при котором fill(λ) ≤ target,
// и оставляет в x (через fill) значения для этого λ. fill монотонно не убывает по λ.
func solveLambda(target float64, fill func(float64) float64, hi float64) {
	lo := 0.0
	if fill(hi) <= target {
		return
	}
	for range planSearchIterations {
		mid := (lo + hi) / 2
		if fill(mid) <= target {
			lo = mid
		} else {
			hi = mid
		}
	}
	fill(lo)
}

// roundSlots — шаг 6: округление до 5 минут методом наибольших остатков.
// Каждая задача получает не больше одной прибавки и не выше своего потолка.
func roundSlots(total int, sorted []PlanCandidate, x, ceiling []float64) []int {
	n := len(x)
	a := make([]int, n)
	left := total
	for i := range x {
		// 1e-6 — защита от ошибок float: 90 не должно стать 89,999… → 85
		a[i] = int(math.Floor((x[i]+1e-6)/planStep)) * planStep
		left -= a[i]
	}

	order := make([]int, n)
	for i := range order {
		order[i] = i
	}
	fraction := func(i int) float64 { return x[i] - float64(a[i]) }
	sort.SliceStable(order, func(p, q int) bool {
		i, j := order[p], order[q]
		if math.Abs(fraction(i)-fraction(j)) > 1e-6 {
			return fraction(i) > fraction(j)
		}
		return sorted[i].Priority > sorted[j].Priority && !samePriority(sorted[i].Priority, sorted[j].Priority)
	})
	for _, i := range order {
		if left < planStep {
			break
		}
		if float64(a[i]+planStep) <= ceiling[i]+1e-6 {
			a[i] += planStep
			left -= planStep
		}
	}
	return a
}
