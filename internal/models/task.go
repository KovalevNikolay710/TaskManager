package models

import "time"

type Task struct {
	TaskId              int64 `gorm:"primaryKey;autoIncrement"`
	UserId              int64 `gorm:"index;not null"`
	GroupId             int64 `gorm:"index"` // Index for better query performance
	DeadLine            time.Time
	TimeForExecution    int `gorm:"not null"` // Duration in hours
	Priority            float64
	PercentOfCompleting int
	Status              string `gorm:"type:enum('Pending', 'In Progress', 'Completed');default:'Pending'"`
	Description         string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// TaskCreateRequest представляет данные для создания задачи
type TaskCreateRequest struct {
	UserID              int64     `json:"userId" binding:"required"`
	GroupID             int64     `json:"groupId"`
	Description         string    `json:"description" binding:"required"`
	DeadLine            time.Time `json:"deadline" binding:"required"`
	TimeForExecution    int       `json:"timeForExecution" binding:"required"` // ms
	PercentOfCompleting int       `json:"percentOfCompleting" binding:"required"`
}

// TaskUpdateRequest представляет данные для обновления задачи
type TaskUpdateRequest struct {
	Status              string        `json:"status"`
	TimeForExecution    time.Duration `json:"timeForExecution"`
	PercentOfCompleting int           `json:"percentOfCompleting"`
}

// TaskFilter представляет фильтры для поиска задач
type TaskFilter struct {
	Status   string
	Priority float64
}
