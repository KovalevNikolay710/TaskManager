package services

import (
	"TaskManager/internal/models"
	"testing"
	"time"
)

// Задачи примеров из design/screens/day.md («Требуется от бэкенда», п. 2): 24 сентября, 08:00.
type exampleTask struct {
	id      int64
	name    string
	pg      uint64
	te      int
	percent int
	hours   int // H — часы до дедлайна
}

var exampleTasks = []exampleTask{
	{1, "Код-ревью задачи по API", 2, 90, 0, 10},
	{2, "Подготовить отчёт по ТИПИС", 3, 180, 40, 26},
	{3, "Лабораторная №4 по БД", 3, 120, 0, 74},
	{4, "Пробежка 5 км", 1, 45, 0, 14},
	{5, "Гитара: разобрать «Группу крови»", 2, 600, 20, 336},
	{6, "Купить продукты на неделю", 1, 60, 0, 36},
	{7, "Прочитать главу «Чистой архитектуры»", 2, 240, 50, 144},
}

var exampleNow = time.Date(2026, 9, 24, 8, 0, 0, 0, time.UTC)

// candidates строит кандидатов так же, как сервис: Pt по формуле, W и D — newPlanCandidate.
func candidates(ids ...int64) []PlanCandidate {
	result := make([]PlanCandidate, 0, len(ids))
	for _, id := range ids {
		for _, e := range exampleTasks {
			if e.id != id {
				continue
			}
			task := &models.Task{
				TaskId:               e.id,
				GroupPriorty:         e.pg,
				TimeForExecution:     e.te,
				PercentOfCompleting:  e.percent,
				NumberOfHoursUntilDL: e.hours,
				DeadLine:             exampleNow.Add(time.Duration(e.hours) * time.Hour),
			}
			calculateTaskPriorty(task)
			result = append(result, newPlanCandidate(task, exampleNow.Truncate(24*time.Hour), exampleNow))
		}
	}
	return result
}

func TestAllocateDayTime(t *testing.T) {
	all := []int64{1, 2, 3, 4, 5, 6, 7}
	tests := []struct {
		name  string
		total int
		cands []PlanCandidate
		want  map[int64]int // TaskId → минуты; задач не из карты в плане быть не должно
	}{
		{
			name:  "пример 1: хватает времени (6:00)",
			total: 360,
			cands: candidates(all...),
			want:  map[int64]int{1: 90, 2: 85, 3: 40, 4: 45, 5: 40, 6: 35, 7: 25},
		},
		{
			name:  "пример 2: не хватает (4:00)",
			total: 240,
			cands: candidates(all...),
			want:  map[int64]int{1: 90, 2: 55, 3: 30, 4: 20, 5: 15, 6: 15, 7: 15},
		},
		{
			name:  "пример 3: задачи не помещаются (1:30)",
			total: 90,
			cands: candidates(all...),
			want:  map[int64]int{1: 15, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15},
		},
		{
			name:  "пример 4: свободное время (8:00)",
			total: 480,
			cands: candidates(1, 2, 4, 6),
			want:  map[int64]int{1: 90, 2: 110, 4: 45, 6: 60},
		},
		{
			name:  "пересборка: код-ревью выполнено, 7:00 − 1:30 = 330",
			total: 330,
			cands: candidates(2, 3, 4, 5, 6, 7),
			want:  map[int64]int{2: 110, 3: 55, 4: 45, 5: 50, 6: 40, 7: 30},
		},
		{
			name:  "меньше 15 минут — план пуст",
			total: 10,
			cands: candidates(all...),
			want:  map[int64]int{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slots := AllocateDayTime(tt.total, tt.cands)
			got := make(map[int64]int, len(slots))
			sum := 0
			for _, s := range slots {
				got[s.TaskId] = s.Minutes
				sum += s.Minutes
				if s.Minutes < planMinSlot || s.Minutes%planStep != 0 {
					t.Errorf("задача %d: %d мин — слот должен быть ≥ 15 и кратен 5", s.TaskId, s.Minutes)
				}
			}
			if sum > tt.total {
				t.Errorf("сумма слотов %d больше времени дня %d", sum, tt.total)
			}
			if len(got) != len(tt.want) {
				t.Errorf("в плане %d задач, ожидалось %d: %v", len(got), len(tt.want), got)
			}
			for id, want := range tt.want {
				if got[id] != want {
					t.Errorf("задача %d: %d мин, ожидалось %d", id, got[id], want)
				}
			}
		})
	}
}

func TestAllocateDayTimeOrder(t *testing.T) {
	slots := AllocateDayTime(360, candidates(7, 6, 5, 4, 3, 2, 1))
	want := []int64{1, 2, 3, 4, 5, 6, 7}
	for i, s := range slots {
		if s.TaskId != want[i] {
			t.Fatalf("порядок слотов %v, ожидался по Pt ↓: %v", slots, want)
		}
	}
}
