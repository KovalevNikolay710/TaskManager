package models

import "time"

const (
	StatusActive    = 1
	StatusCompleted = 2
)

type Task struct {
	TaskId               int64  `gorm:"primaryKey;autoIncrement"`
	UserId               int64  `gorm:"not null"`
	GroupId              int64  `gorm:"index;default:0"` // 0 — задача без группы; индекс ускоряет выборку задач группы
	GroupPriorty         uint64 `gorm:"default:1"`
	DeadLine             time.Time
	TimeForExecution     int `gorm:"not null"`
	Priority             float64
	NumberOfHoursUntilDL int
	PercentOfCompleting  int
	Status               uint16 `gorm:"not null; default:1"`
	Name                 string
	Description          string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type TaskCreateRequest struct {
	UserID           int64     `json:"userId" binding:"required"`
	Name             string    `json:"name" binding:"required"`
	Description      string    `json:"description"`
	DeadLine         time.Time `json:"deadline" binding:"required"` // RFC3339
	TimeForExecution int       `json:"timeForExecution" binding:"required,min=1"`
	// Новая задача не может быть выполнена: 0–99, по умолчанию 0
	PercentOfCompleting int `json:"percentOfCompleting" binding:"min=0,max=99"`
	// 0 или не передан — без группы
	GroupId int64 `json:"groupId" binding:"min=0"`
}

// TaskUpdateRequest — частичное обновление: nil (поле не передано) — не менять.
// Указатели нужны, чтобы отличать «не передано» от 0 и пустой строки.
type TaskUpdateRequest struct {
	// Status: 1 — вернуть задачу в работу, 2 — отметить выполненной
	Status              *uint16    `json:"status" binding:"omitempty,oneof=1 2"`
	Name                *string    `json:"name"`
	Description         *string    `json:"description"`
	DeadLine            *time.Time `json:"deadline"` // RFC3339
	TimeForExecution    *int       `json:"timeForExecution" binding:"omitempty,min=1"`
	PercentOfCompleting *int       `json:"percentOfCompleting" binding:"omitempty,min=0,max=100"`
	// 0 — убрать из группы
	GroupId *int64 `json:"groupId" binding:"omitempty,min=0"`
}

type TaskFilter struct {
	Status  uint64    `json:"status"`
	Date    time.Time `json:"date"`
	GroupId int64     `json:"groupId"`
}
