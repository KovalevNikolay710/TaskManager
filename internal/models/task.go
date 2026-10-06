package models

import "time"

const (
	StatusActive    = 1
	StatusCompleted = 2
)

type Task struct {
	TaskId              int64     `gorm:"primaryKey;autoIncrement" json:"TaskId"`
	UserId              int64     `gorm:"not null;index:idx_tasks_user_status,priority:1" json:"UserId"`
	GroupId             int64     `gorm:"index;default:0" json:"GroupId"` // 0 — задача без группы; индекс ускоряет выборку задач группы
	GroupPriority       uint64    `gorm:"default:1" json:"GroupPriority"`
	Deadline            time.Time `json:"Deadline"`
	TimeForExecution    int       `gorm:"not null" json:"TimeForExecution"`
	Priority            float64   `json:"Priority"`
	HoursUntilDeadline  int       `json:"HoursUntilDeadline"`
	PercentOfCompleting int       `json:"PercentOfCompleting"`
	Status              uint16    `gorm:"not null;default:1;index:idx_tasks_user_status,priority:2" json:"Status"`
	Name                string    `json:"Name"`
	Description         string    `json:"Description"`
	CreatedAt           time.Time `json:"CreatedAt"`
	UpdatedAt           time.Time `json:"UpdatedAt"`
}

type TaskCreateRequest struct {
	UserID           int64     `json:"userId" binding:"required"`
	Name             string    `json:"name" binding:"required"`
	Description      string    `json:"description"`
	Deadline         time.Time `json:"deadline" binding:"required"` // RFC3339
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
	Deadline            *time.Time `json:"deadline"` // RFC3339
	TimeForExecution    *int       `json:"timeForExecution" binding:"omitempty,min=1"`
	PercentOfCompleting *int       `json:"percentOfCompleting" binding:"omitempty,min=0,max=100"`
	// 0 — убрать из группы
	GroupId *int64 `json:"groupId" binding:"omitempty,min=0"`
}

// TaskFilter — фильтр списка задач: query GET /tasks/user/:user_id (?status=&groupId=&date=); нулевое значение — не фильтровать.
type TaskFilter struct {
	Status  uint64    `json:"status" form:"status"`
	Date    time.Time `json:"date" form:"date"` // RFC3339; только задачи с дедлайном позже
	GroupId int64     `json:"groupId" form:"groupId"`
}
