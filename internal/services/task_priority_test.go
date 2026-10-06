package services

import (
	"TaskManager/internal/models"
	"math"
	"testing"
	"time"
)

func TestHoursUntilDeadline(t *testing.T) {
	tests := []struct {
		name     string
		deadline time.Time
		want     int
	}{
		{"ровно 10 часов", exampleNow.Add(10 * time.Hour), 10},
		{"дробная часть отбрасывается (10:59)", exampleNow.Add(10*time.Hour + 59*time.Minute), 10},
		{"меньше часа даёт 0", exampleNow.Add(59 * time.Minute), 0},
		{"дедлайн сейчас", exampleNow, 0},
		{"прошлое: -2 часа", exampleNow.Add(-2 * time.Hour), -2},
		{"прошлое: -90 минут: усечение даёт -1", exampleNow.Add(-90 * time.Minute), -1},
		{"сутки", exampleNow.Add(24 * time.Hour), 24},
		{"другой часовой пояс не влияет", exampleNow.Add(5 * time.Hour).In(time.FixedZone("X", 3*3600)), 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := models.HoursUntilDeadline(tt.deadline, exampleNow); got != tt.want {
				t.Errorf("получено %d ч, ожидалось %d", got, tt.want)
			}
		})
	}
}

func TestCalculateTaskPriorty(t *testing.T) {
	tests := []struct {
		name    string
		pg      uint64
		te      int
		tl      int
		percent int
		want    float64
	}{
		// первые 4 кейса совпадают с web/src/lib/priority.test.ts
		{"Pg=3 Te=120 Tl=10 0%", 3, 120, 10, 0, 36},
		{"Pg=1 Te=60 Tl=1 50%", 1, 60, 1, 50, 30},
		{"Pg=2 Te=30 Tl=24 100%", 2, 30, 24, 100, 0},
		{"Pg=10 Te=600 Tl=3 25%", 10, 600, 3, 25, 1500},
		{"нулевое время выполнения", 5, 0, 5, 0, 0},
		{"нулевой вес группы", 0, 60, 2, 0, 0},
		{"дробный результат", 1, 60, 36, 0, 60.0 / 36},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &models.Task{GroupPriorty: tt.pg, TimeForExecution: tt.te, NumberOfHoursUntilDL: tt.tl, PercentOfCompleting: tt.percent}
			task.CalculatePriority()
			if math.Abs(task.Priority-tt.want) > 1e-9 {
				t.Errorf("Pt = %v, ожидалось %v", task.Priority, tt.want)
			}
		})
	}
}

func TestCalculateTaskPriortyMonotonic(t *testing.T) {
	pt := func(tl, percent int) float64 {
		task := &models.Task{GroupPriorty: 2, TimeForExecution: 100, NumberOfHoursUntilDL: tl, PercentOfCompleting: percent}
		task.CalculatePriority()
		return task.Priority
	}
	// Ближе дедлайн — выше приоритет (строго)
	tls := []int{1, 2, 5, 10}
	for i := 1; i < len(tls); i++ {
		if a, b := pt(tls[i-1], 0), pt(tls[i], 0); a <= b {
			t.Errorf("Tl=%d: Pt=%v должен быть строго больше, чем при Tl=%d: Pt=%v", tls[i-1], a, tls[i], b)
		}
	}
	// Больше выполнено — ниже приоритет (строго)
	percents := []int{0, 25, 50, 100}
	for i := 1; i < len(percents); i++ {
		if a, b := pt(10, percents[i-1]), pt(10, percents[i]); a <= b {
			t.Errorf("%d%%: Pt=%v должен быть строго больше, чем при %d%%: Pt=%v", percents[i-1], a, percents[i], b)
		}
	}
}

func TestRefreshTaskPriorty(t *testing.T) {
	tests := []struct {
		name     string
		deadline time.Time
		staleTl  int
		wantTl   int
		wantPt   float64
	}{
		{"Tl пересчитывается от now", exampleNow.Add(10 * time.Hour), 99, 10, 36},
		{"дробная часть отбрасывается", exampleNow.Add(10*time.Hour + 40*time.Minute), 99, 10, 36},
		{"просрочена: Tl = 1", exampleNow.Add(-5 * time.Hour), 99, 1, 360},
		{"дедлайн сейчас: Tl = 1", exampleNow, 0, 1, 360},
		{"меньше часа: Tl = 1", exampleNow.Add(30 * time.Minute), 7, 1, 360},
		{"ровно час: Tl = 1", exampleNow.Add(time.Hour), 7, 1, 360},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &models.Task{GroupPriorty: 3, TimeForExecution: 120, PercentOfCompleting: 0,
				DeadLine: tt.deadline, NumberOfHoursUntilDL: tt.staleTl}
			task.Recalculate(exampleNow)
			if task.NumberOfHoursUntilDL != tt.wantTl {
				t.Errorf("Tl = %d, ожидалось %d", task.NumberOfHoursUntilDL, tt.wantTl)
			}
			if math.IsInf(task.Priority, 0) || math.IsNaN(task.Priority) {
				t.Fatalf("Pt = %v — деление на ноль", task.Priority)
			}
			if math.Abs(task.Priority-tt.wantPt) > 1e-9 {
				t.Errorf("Pt = %v, ожидалось %v", task.Priority, tt.wantPt)
			}
		})
	}
}

func TestNewPlanCandidate(t *testing.T) {
	// Truncate(24h) даёт полночь именно потому, что exampleNow в UTC
	today := exampleNow.Truncate(24 * time.Hour)
	tomorrow := today.Add(24 * time.Hour)
	tests := []struct {
		name     string
		task     models.Task
		dayStart time.Time
		wantWork float64
		wantDays int
	}{
		{"сегодня: Tl 10 -> 1 день", models.Task{TimeForExecution: 100, NumberOfHoursUntilDL: 10}, today, 100, 1},
		{"сегодня: Tl 24 -> 1 день", models.Task{TimeForExecution: 100, NumberOfHoursUntilDL: 24}, today, 100, 1},
		{"сегодня: Tl 25 -> 2 дня", models.Task{TimeForExecution: 100, NumberOfHoursUntilDL: 25}, today, 100, 2},
		{"W учитывает процент выполнения", models.Task{TimeForExecution: 200, PercentOfCompleting: 25, NumberOfHoursUntilDL: 5}, today, 150, 1},
		{"выполнена: W = 0", models.Task{TimeForExecution: 200, PercentOfCompleting: 100, NumberOfHoursUntilDL: 5}, today, 0, 1},
		{"Tl = 0 даёт минимум 1 день", models.Task{TimeForExecution: 60, NumberOfHoursUntilDL: 0}, today, 60, 1},
		{"будущий день: часы от начала дня", models.Task{TimeForExecution: 60, DeadLine: tomorrow.Add(49 * time.Hour)}, tomorrow, 60, 3},
		{"будущий день: дедлайн раньше начала дня -> 1 день", models.Task{TimeForExecution: 60, DeadLine: tomorrow.Add(-time.Hour)}, tomorrow, 60, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := tt.task
			task.TaskId = 7
			task.Priority = 4.5
			task.DeadLine = tt.task.DeadLine
			c := newPlanCandidate(&task, tt.dayStart, exampleNow)
			if c.Work != tt.wantWork || c.Days != tt.wantDays {
				t.Errorf("W=%v D=%d, ожидалось W=%v D=%d", c.Work, c.Days, tt.wantWork, tt.wantDays)
			}
			if c.Priority != 4.5 || !c.DeadLine.Equal(tt.task.DeadLine) {
				t.Errorf("Priority/DeadLine не скопированы: %v, %v", c.Priority, c.DeadLine)
			}
			if c.TaskId != 7 {
				t.Errorf("TaskId = %d, ожидалось 7", c.TaskId)
			}
		})
	}
}

func TestSortPlanCandidates(t *testing.T) {
	d1 := exampleNow.Add(time.Hour)
	d2 := exampleNow.Add(2 * time.Hour)
	tests := []struct {
		name string
		in   []PlanCandidate
		want []int64
	}{
		{"по приоритету убывание", []PlanCandidate{{TaskId: 1, Priority: 1}, {TaskId: 2, Priority: 3}, {TaskId: 3, Priority: 2}}, []int64{2, 3, 1}},
		{"равный Pt: ранний дедлайн первым", []PlanCandidate{{TaskId: 1, Priority: 5, DeadLine: d2}, {TaskId: 2, Priority: 5, DeadLine: d1}}, []int64{2, 1}},
		{"равные Pt и дедлайн: меньший TaskId", []PlanCandidate{{TaskId: 9, Priority: 5, DeadLine: d1}, {TaskId: 4, Priority: 5, DeadLine: d1}}, []int64{4, 9}},
		{"Pt равны в пределах эпсилон", []PlanCandidate{{TaskId: 1, Priority: 1.0 + 1e-12, DeadLine: d2}, {TaskId: 2, Priority: 1.0, DeadLine: d1}}, []int64{2, 1}},
		{"пустой список", nil, []int64{}},
		{"один элемент", []PlanCandidate{{TaskId: 1}}, []int64{1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sortPlanCandidates(tt.in)
			if len(tt.in) != len(tt.want) {
				t.Fatalf("длина %d, ожидалась %d", len(tt.in), len(tt.want))
			}
			for i, c := range tt.in {
				if c.TaskId != tt.want[i] {
					t.Fatalf("порядок неверный на позиции %d: получено %d, ожидалось %d", i, c.TaskId, tt.want[i])
				}
			}
		})
	}
}

// checkSlotInvariants проверяет инварианты из CLAUDE.md: слот >= 15 и кратен 5, сумма <= total.
func checkSlotInvariants(t *testing.T, total int, slots []PlanSlot) {
	t.Helper()
	sum := 0
	for _, s := range slots {
		sum += s.Minutes
		if s.Minutes < planMinSlot || s.Minutes%planStep != 0 {
			t.Errorf("задача %d: %d мин нарушает инвариант слота", s.TaskId, s.Minutes)
		}
	}
	// для total < 0 (недопустимый ввод) план пуст, и сравнивать с отрицательным лимитом нечего
	if total >= 0 && sum > total {
		t.Errorf("сумма %d больше total %d", sum, total)
	}
}

func TestAllocateDayTimeEdgeCases(t *testing.T) {
	mk := func(id int64, pt, work float64, days int) PlanCandidate {
		return PlanCandidate{TaskId: id, Priority: pt, DeadLine: exampleNow.Add(time.Duration(id) * time.Hour), Work: work, Days: days}
	}
	tests := []struct {
		name  string
		total int
		cands []PlanCandidate
		count int // ожидаемое число слотов
	}{
		{"нет кандидатов", 120, nil, 0},
		{"нулевое время", 0, []PlanCandidate{mk(1, 1, 60, 1)}, 0},
		{"отрицательное время", -30, []PlanCandidate{mk(1, 1, 60, 1)}, 0},
		{"ровно 15 минут", 15, []PlanCandidate{mk(1, 1, 60, 1), mk(2, 2, 60, 1)}, 1},
		{"14 минут", 14, []PlanCandidate{mk(1, 1, 60, 1)}, 0},
		{"лишние кандидаты отсекаются по приоритету", 45, []PlanCandidate{mk(1, 1, 60, 1), mk(2, 2, 60, 1), mk(3, 3, 60, 1), mk(4, 4, 60, 1)}, 3},
		{"нулевой приоритет у всех", 120, []PlanCandidate{mk(1, 0, 60, 1), mk(2, 0, 60, 1)}, 2},
		{"нулевая работа даёт минимальный слот", 120, []PlanCandidate{mk(1, 1, 0, 1)}, 1},
		{"максимум дня 16:00", 960, []PlanCandidate{mk(1, 1, 600, 1), mk(2, 2, 600, 1), mk(3, 3, 600, 1)}, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slots := AllocateDayTime(tt.total, tt.cands)
			if slots == nil {
				t.Fatal("ожидался пустой срез, а не nil")
			}
			if len(slots) != tt.count {
				t.Errorf("слотов %d, ожидалось %d", len(slots), tt.count)
			}
			checkSlotInvariants(t, tt.total, slots)
		})
	}
}

func TestAllocateDayTimeInvariants(t *testing.T) {
	// Перебор времени дня с шагом 5 минут: инварианты и монотонность по приоритету
	// для задач с одинаковой работой и сроком (больший Pt не получает меньше).
	cands := []PlanCandidate{}
	for i := int64(1); i <= 8; i++ {
		cands = append(cands, PlanCandidate{TaskId: i, Priority: float64(i), DeadLine: exampleNow.Add(time.Hour), Work: 120, Days: 2})
	}
	for total := 15; total <= 960; total += 5 {
		slots := AllocateDayTime(total, cands)
		checkSlotInvariants(t, total, slots)
		for i := 1; i < len(slots); i++ {
			// слоты идут по Pt убывание, значит минуты не должны возрастать
			if slots[i].Minutes > slots[i-1].Minutes {
				t.Fatalf("total=%d: задача %d (Pt ниже) получила %d > %d у задачи %d", total, slots[i].TaskId, slots[i].Minutes, slots[i-1].Minutes, slots[i-1].TaskId)
			}
		}
	}
}

func TestAllocateDayTimeLargeInput(t *testing.T) {
	cands := make([]PlanCandidate, 10000)
	for i := range cands {
		cands[i] = PlanCandidate{TaskId: int64(i + 1), Priority: float64(i%50 + 1), DeadLine: exampleNow.Add(time.Duration(i) * time.Minute), Work: float64(30 + i%200), Days: 1 + i%5}
	}
	slots := AllocateDayTime(960, cands)
	if len(slots) > 960/planMinSlot {
		t.Errorf("слотов %d, ожидалось не больше %d", len(slots), 960/planMinSlot)
	}
	checkSlotInvariants(t, 960, slots)
}

func TestAllocateDayTimeDoesNotMutateInput(t *testing.T) {
	cands := []PlanCandidate{{TaskId: 1, Priority: 1, Work: 60, Days: 1}, {TaskId: 2, Priority: 9, Work: 60, Days: 1}}
	AllocateDayTime(120, cands)
	if cands[0].TaskId != 1 || cands[1].TaskId != 2 {
		t.Error("входной срез кандидатов изменён")
	}
}
