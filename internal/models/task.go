package models

import "time"

const (
	StatusActive = iota
	StatusCompleted
)

type Task struct {
	TaskId               int64 `gorm:"primaryKey;autoIncrement"`
	UserId               int64 `gorm:"not null"`
	GroupId              int64
	GroupPriorty         uint64 `gorm:"default:1"`
	DeadLine             time.Time
	TimeForExecution     int `gorm:"not null"`
	Priority             float64
	NumberOfHoursUntilDL int
	PercentOfCompleting  int
	Status               uint16 `gorm:"not null"`
	Name                 string
	Description          string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type TaskCreateRequest struct {
	UserID              int64     `json:"userId" binding:"required"`
	GroupID             int64     `json:"groupId"`
	Name                string    `json:"name" binding:"required"`
	Description         string    `json:"description"`
	DeadLine            time.Time `json:"deadline" binding:"required"` // RFC3339
	TimeForExecution    int       `json:"timeForExecution" binding:"required"`
	PercentOfCompleting int       `json:"percentOfCompleting" binding:"required"`
}

type TaskUpdateRequest struct {
	// Status              uint16        `json:"status"` пока не нужен, так как пока что не придумал как избегать просроченных дедлайнов
	DeadLine            time.Time `json:"deadline"` // RFC3339
	TimeForExecution    int       `json:"timeForExecution"`
	PercentOfCompleting int       `json:"percentOfCompleting"`
}

type TaskFilter struct {
	Status uint64
	Date   time.Time
}
