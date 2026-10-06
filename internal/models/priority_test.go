package models

import (
	"math"
	"testing"
	"time"
)

func TestTaskRecalculate(t *testing.T) {
	now := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		deadline time.Time
		percent  int
		wantTl   int
		wantPt   float64
	}{
		{"Tl от now, дробная часть отбрасывается", now.Add(10*time.Hour + 40*time.Minute), 0, 10, 36},
		{"учитывается выполненный процент", now.Add(10 * time.Hour), 50, 10, 18},
		{"просрочена: Tl = 1", now.Add(-5 * time.Hour), 0, 1, 360},
		{"меньше часа: Tl = 1", now.Add(30 * time.Minute), 0, 1, 360},
		{"выполнена на 100%: приоритет 0", now.Add(10 * time.Hour), 100, 10, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// устаревший Tl должен быть перезаписан
			task := &Task{GroupPriorty: 3, TimeForExecution: 120, PercentOfCompleting: tt.percent,
				DeadLine: tt.deadline, NumberOfHoursUntilDL: 99, Priority: 12345}
			task.Recalculate(now)
			if task.NumberOfHoursUntilDL != tt.wantTl {
				t.Errorf("Tl = %d, ожидалось %d", task.NumberOfHoursUntilDL, tt.wantTl)
			}
			if math.Abs(task.Priority-tt.wantPt) > 1e-9 {
				t.Errorf("Pt = %v, ожидалось %v", task.Priority, tt.wantPt)
			}
		})
	}
}
