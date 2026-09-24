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
	UserID              int64     `json:"userId" binding:"required"`
	Name                string    `json:"name" binding:"required"`
	Description         string    `json:"description"`
	DeadLine            time.Time `json:"deadline" binding:"required"` // RFC3339
	TimeForExecution    int       `json:"timeForExecution" binding:"required"`
	PercentOfCompleting int       `json:"percentOfCompleting" binding:"required"`
	GroupPriority       int
	GroupId             int64
}

type TaskUpdateRequest struct {
	// Status: 1 — вернуть задачу в работу, 2 — отметить выполненной; 0 (не передан) — не менять
	Status              uint16    `json:"status" binding:"omitempty,oneof=1 2"`
	DeadLine            time.Time `json:"deadline"` // RFC3339
	TimeForExecution    int       `json:"timeForExecution"`
	PercentOfCompleting int       `json:"percentOfCompleting"`
	Description         string    `json:"description"`
	GroupPriority       uint64    `json:"groupPriorty"`
}

type TaskFilter struct {
	Status  uint64    `json:"status"`
	Date    time.Time `json:"date"`
	GroupId int64     `json:"groupId"`
}
