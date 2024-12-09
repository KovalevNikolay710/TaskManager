package models

import "time"

const (
	StatusActive    = 1
	StatusCompleted = 2
)

type Task struct {
	TaskId              int64 `gorm:"primaryKey;autoIncrement"`
	UserId              int64 `gorm:"index;not null"`
	GroupId             int64 `gorm:"index"`
	DeadLine            time.Time
	TimeForExecution    int `gorm:"not null"`
	Priority            float64
	PercentOfCompleting int
	Status              int64 `gorm:"not null"`
	Description         string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type TaskCreateRequest struct {
	UserID              int64     `json:"userId" binding:"required"`
	GroupID             int64     `json:"groupId"`
	Description         string    `json:"description" binding:"required"`
	DeadLine            time.Time `json:"deadline" binding:"required"`
	TimeForExecution    int       `json:"timeForExecution" binding:"required"` // ms
	PercentOfCompleting int       `json:"percentOfCompleting" binding:"required"`
	Status              int64     `json:"status" binding:"required"`
}

type TaskUpdateRequest struct {
	Status              int64         `json:"status"`
	TimeForExecution    time.Duration `json:"timeForExecution"`
	PercentOfCompleting int           `json:"percentOfCompleting"`
}

type TaskFilter struct {
	Status   int64
	Priority float64
}

// type ByPriorty []*Task

// func (a ByPriorty) Len() int           { return len(a) }
// func (a ByPriorty) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
// func (a ByPriorty) Less(i, j int) bool { return a[i].Priority < a[j].Priority }
